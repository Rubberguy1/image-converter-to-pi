# Pixel Pusher frontend — build once, serve with nginx and reverse-proxy /api to
# the Pi. Run this ANYWHERE (laptop, home server); it talks to the Pi backend.
#
#   docker build -t pixel-pusher-frontend ./frontend
#   docker run -p 8080:80 -e PI_HOST=192.168.1.199:8000 pixel-pusher-frontend
#   → open http://localhost:8080
#
# (Or use the repo's docker-compose.yml.)

# --- build the static frontend ---
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
RUN npm run build

# --- serve it + proxy the API to the Pi ---
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template
# host:port of the Pi backend (no scheme). Override at run time.
ENV PI_HOST=raspberrypi.local:8000
EXPOSE 80
