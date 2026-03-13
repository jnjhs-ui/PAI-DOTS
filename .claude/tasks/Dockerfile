FROM node:20-alpine
WORKDIR /app
COPY dashboard.js .
VOLUME /data
ENV TASKS_DIR=/data
EXPOSE 3847
CMD ["node", "dashboard.js", "--host", "0.0.0.0", "--no-open"]
