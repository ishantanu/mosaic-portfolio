# syntax=docker/dockerfile:1.7
FROM node:24.19.0-alpine AS build

ARG VITE_FARO_URL
ENV VITE_FARO_URL=$VITE_FARO_URL

WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=mosaic-npm,target=/root/.npm npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
