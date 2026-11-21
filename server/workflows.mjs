import { readFile } from 'node:fs/promises';

const node = (class_type, inputs) => ({ class_type, inputs });
const models = (catalog, type, input) => {
  const definition = catalog[type]?.input?.required?.[input];
  const options = Array.isArray(definition?.[0]) ? definition[0] : definition?.[1]?.options;
  return Array.isArray(options) ? options.filter(x => typeof x === 'string') : [];
};
const hasNodes = (catalog, names) => names.every(name => Object.hasOwn(catalog, name));
const unavailable = detail => ({ ready: false, detail });

// A teacher may use ComfyUI's "Export (API)" for a different local model.
// Only the workflow on disk sets node types, graph edges, and model paths.
async function customWorkflow(catalog, kind, filename) {
  try {
    const file = JSON.parse(await readFile(filename, 'utf8'));
    const graph = file.prompt || file;
    const nodes = Object.values(graph);
    if (!nodes.length || nodes.some(n => !n?.inputs || !catalog[n.class_type] || catalog[n.class_type].api_node || String(catalog[n.class_type].python_module).startsWith('comfy_api_nodes'))) {
      return unavailable('API 형식으로 내보낸 워크플로와 필요한 ComfyUI 노드를 확인해 주세요.');
    }
    const fields = nodes.flatMap(n => Object.values(n.inputs));
    if (!fields.includes('{{prompt}}') || (kind === 'video' && !fields.includes('{{image}}'))) {
      return unavailable('워크플로의 프롬프트 자리와 영상의 첫 이미지 자리를 확인해 주세요.');
    }
    for (const n of nodes) {
      for (const key of ['ckpt_name','unet_name','vae_name','clip_name','lora_name']) {
        const choices = models(catalog, n.class_type, key);
        if (typeof n.inputs[key] === 'string' && catalog[n.class_type]?.input?.required?.[key] && !choices.includes(n.inputs[key])) {
          return unavailable('워크플로가 지정한 모델이 설치되어 있지 않아요: ' + n.inputs[key]);
        }
      }
    }
    return {ready:true, model:'사용자 워크플로', detail:'이 PC의 ComfyUI 워크플로가 준비됐어요.', build(values) {
      const copy = structuredClone(graph);
      const replacements = new Map(Object.entries(values).map(([k,v])=>['{{'+k+'}}',v]));
      for(const n of Object.values(copy)) for (const [key,val] of Object.entries(n.inputs)) {
        if (replacements.has(val)) n.inputs[key] = replacements.get(val);
      }
      return copy;
    }};
  } catch { return unavailable('설정한 로컬 워크플로의 파일 경로와 JSON 형식을 확인해 주세요.'); }
}

export async function selectWorkflow(catalog, kind) {
  const custom = process.env['THINKING_LAB_'+kind.toUpperCase()+'_WORKFLOW'];
  if (custom) return customWorkflow(catalog, kind, custom);
  if(kind === 'image') {
    if (!hasNodes(catalog,['CheckpointLoaderSimple','CLIPTextEncode','KSampler','EmptyLatentImage','VAEDecode','SaveImage'])) {
      return unavailable('이미지 생성에 필요한 ComfyUI 기본 노드를 확인해 주세요.');
    }
    const options = models(catalog,'CheckpointLoaderSimple','ckpt_name');
    const override = process.env.THINKING_LAB_IMAGE_CHECKPOINT;
    const model = override ? options.find(x=>x===override) : options.find(x=>/(v1[-_.]?5|sd[-_.]?1[-_.]?5|sd[_-]?xl[_-]?base|dreamshaper[_-]?[68])/i.test(x) && !/inpaint|refiner|instruct/i.test(x));
    if (!model) return unavailable('SD 1.5 또는 SDXL 기본 체크포인트를 ComfyUI의 models/checkpoints 폴더에 넣어 주세요.');
    return {ready:true,model,detail:'체크포인트로 이미지를 만들 수 있어요.',build({prompt,seed,prefix}) {
      return {
        '1':node('CheckpointLoaderSimple',{ckpt_name:model}),
        '2':node('CLIPTextEncode',{clip:['1',1],text:prompt}),
        '3':node('CLIPTextEncode',{clip:['1',1],text:''}),
        '4':node('EmptyLatentImage',{width:768,height:512,batch_size:1}),
        '5':node('KSampler',{model:['1',0],seed,steps:20,cfg:7,sampler_name:'euler',scheduler:'normal',positive:['2',0],negative:['3',0],latent_image:['4',0],denoise:1}),
        '6':node('VAEDecode',{samples:['5',0],vae:['1',2]}),
        '7':node('SaveImage',{images:['6',0],filename_prefix:prefix})
      };
    }};
  }
  const ltx = models(catalog,'CheckpointLoaderSimple','ckpt_name').find(file=>/ltx[-_]video[-_]2b[-_]v0\.9\.5\.safetensors$/i.test(file));
  const t5 = models(catalog,'CLIPLoader','clip_name').find(file=>/(^|[\\/])t5xxl[_-](fp8|fp16).*\.safetensors$/i.test(file));
  if(ltx && t5 && hasNodes(catalog,['CLIPTextEncode','LoadImage','LTXVPreprocess','LTXVImgToVideo','LTXVConditioning','LTXVScheduler','KSamplerSelect','SamplerCustom','VAEDecode','SaveWEBM'])){
    return {ready:true,model:ltx,detail:'LTX-Video로 첫 이미지에서 움직임을 만들 수 있어요.',build({prompt,seed,image,prefix,width,height}) {
      const dims=width===height?[512,512]:width>height?[640,Math.max(192,Math.round(640*height/width/32)*32)]:[Math.max(192,Math.round(640*width/height/32)*32),640];
      return {
        '1':node('CheckpointLoaderSimple',{ckpt_name:ltx}),
        '2':node('CLIPLoader',{clip_name:t5,type:'ltxv',device:'default'}),
        '3':node('CLIPTextEncode',{clip:['2',0],text:prompt}),
        '4':node('CLIPTextEncode',{clip:['2',0],text:'jitter, blurry, watermark'}),
        '5':node('LoadImage',{image}),
        '6':node('LTXVPreprocess',{image:['5',0],img_compression:40}),
        '7':node('LTXVImgToVideo',{image:['6',0],vae:['1',2],positive:['3',0],negative:['4',0],width:dims[0],height:dims[1],length:49,batch_size:1,strength:1}),
        '8':node('LTXVConditioning',{positive:['7',0],negative:['7',1],frame_rate:24}),
        '9':node('LTXVScheduler',{latent:['7',2],steps:30,max_shift:2.05,base_shift:0.95,stretch:true,terminal:0.1}),
        '10':node('KSamplerSelect',{sampler_name:'euler'}),
        '11':node('SamplerCustom',{model:['1',0],positive:['8',0],negative:['8',1],sampler:['10',0],sigmas:['9',0],latent_image:['7',2],add_noise:true,noise_seed:seed,cfg:3}),
        '12':node('VAEDecode',{samples:['11',0],vae:['1',2]}),
        '13':node('SaveWEBM',{images:['12',0],filename_prefix:prefix,codec:'vp9',fps:24,crf:30})
      };
    }};
  }
  // ComfyUI's official Wan 2.1 I2V graph, with its native WebM writer enabled.
  const types = ['UNETLoader','CLIPLoader','VAELoader','CLIPVisionLoader','CLIPVisionEncode','CLIPTextEncode','WanImageToVideo','LoadImage','ModelSamplingSD3','KSampler','VAEDecode','SaveWEBM'];
  if (!hasNodes(catalog,types)) return unavailable('LTX-Video 또는 Wan 이미지→영상 노드와 SaveWEBM이 있는 ComfyUI를 실행해 주세요.');
  const find = (type, name, pattern) => models(catalog,type,name).find(file=>pattern.test(file));
  const diffusion = find('UNETLoader','unet_name',/wan[_-]?2[._]1[_-]i2v[_-]480p[_-]14b.*\.safetensors$/i);
  const encoder = find('CLIPLoader','clip_name',/umt5[_-]xxl.*\.safetensors$/i);
  const vae = find('VAELoader','vae_name',/wan[_-]?2[._]1[_-]vae.*\.safetensors$/i);
  const vision = find('CLIPVisionLoader','clip_name',/clip[_-]vision[_-]h\.safetensors$/i);
  if (!diffusion || !encoder || !vae || !vision) {
    return unavailable('LTX-Video 2B 0.9.5와 T5 인코더 또는 Wan 2.1 I2V 모델 세트를 준비해 주세요.');
  }
  return {ready:true,model:diffusion,detail:'첫 이미지와 움직임 프롬프트로 영상을 만들 수 있어요.',build({prompt,seed,image,prefix,width,height}) {
    const [w,h] = width===height?[512,512] : width>height?[640,Math.max(192,Math.round(640*height/width/16)*16)] : [Math.max(192,Math.round(640*width/height/16)*16),640];
    return {
      '1':node('UNETLoader',{unet_name:diffusion,weight_dtype:'default'}),
      '2':node('CLIPLoader',{clip_name:encoder,type:'wan',device:'default'}),
      '3':node('VAELoader',{vae_name:vae}),
      '4':node('LoadImage',{image}),
      '5':node('CLIPVisionLoader',{clip_name:vision}),
      '6':node('CLIPVisionEncode',{clip_vision:['5',0],image:['4',0],crop:'none'}),
      '7':node('CLIPTextEncode',{clip:['2',0],text:prompt}),
      '8':node('CLIPTextEncode',{clip:['2',0],text:'blurry, still image, subtitles, watermark'}),
      '9':node('WanImageToVideo',{positive:['7',0],negative:['8',0],vae:['3',0],clip_vision_output:['6',0],start_image:['4',0],width:w,height:h,length:33,batch_size:1}),
      '10':node('ModelSamplingSD3',{model:['1',0],shift:8}),
      '11':node('KSampler',{model:['10',0],positive:['9',0],negative:['9',1],latent_image:['9',2],seed,steps:20,cfg:6,sampler_name:'uni_pc',scheduler:'simple',denoise:1}),
      '12':node('VAEDecode',{samples:['11',0],vae:['3',0]}),
      '13':node('SaveWEBM',{images:['12',0],filename_prefix:prefix,codec:'vp9',fps:16,crf:30})
    };
  }};
}
