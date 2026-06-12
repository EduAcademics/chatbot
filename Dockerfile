# ==========================================
# Stage 1: Build the Frontend Application
# ==========================================
FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

RUN npm run build

# ==========================================
# Stage 2: Serve with Secure Nginx Container
# ==========================================
FROM nginx:alpine

RUN rm -rf /etc/nginx/nginx.conf /etc/nginx/conf.d/default.conf

COPY --from=builder /app/dist /usr/share/nginx/html

COPY nginx.conf /etc/nginx/nginx.conf

RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx && \
    touch /tmp/nginx.pid && \
    chown -R nginx:nginx /tmp/nginx.pid

USER nginx

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]