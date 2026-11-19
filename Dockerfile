# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# Baked in at build time: Vite inlines VITE_* into the bundle. Empty means same-origin
# `/api`, routed to the backend by the reverse proxy in front of this container.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- serve ----
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Empty on purpose: operators mount their own privacy.md and imprint.md here.
RUN mkdir -p /usr/share/nginx/html/legal
EXPOSE 80
