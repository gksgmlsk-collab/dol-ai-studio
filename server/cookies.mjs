export function cookieAttributes(req,maxAge,path='/') {
  const secure=req.socket.encrypted||process.env.DOL_COOKIE_SECURE==='1'||Boolean(process.env.RAILWAY_ENVIRONMENT_ID);
  return '; Path='+path+'; HttpOnly; SameSite=Strict; Max-Age='+maxAge+(secure?'; Secure':'');
}
