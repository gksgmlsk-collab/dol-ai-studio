FROM node:26-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    DOL_SCHOOL_DIR=/data/school \
    THINKING_LAB_DATA=/data/jobs
COPY dist ./dist
COPY server ./server
COPY server.mjs ./
CMD ["node", "server.mjs"]
