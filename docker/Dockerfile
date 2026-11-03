# syntax=docker/dockerfile:1
#
# Build from the repository root. Two images:
#
#   docker build -f docker/Dockerfile -t netxms-console .
#     Release bundle on nginx, proxying /api to the netxmsd WebAPI at NETXMS_WEBAPI (host:port).
#
#   docker build -f docker/Dockerfile --target demo -t netxms-console-demo .
#     Demo bundle on the mock data in mocks/, no server needed.
#
# VITE_MODULES and VITE_FORCE_MODULES (build arguments) compile in enterprise modules.

FROM node:26-alpine AS source
WORKDIR /app
RUN npm install -g corepack@0.36.0 && corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
RUN yarn install --immutable
COPY . .

FROM source AS build
ARG VITE_MODULES
ARG VITE_FORCE_MODULES
RUN yarn build

# Only the enabled modules' mocks go into the demo image, never other module sources.
FROM source AS demo-build
ARG VITE_MODULES
ARG VITE_FORCE_MODULES
RUN yarn build --mode demo \
 && mkdir -p out/src/modules out/docker \
 && cp -r dist mocks package.json vite-plugin-mock-api.js out/ \
 && cp src/modules/parseModuleList.js out/src/modules/ \
 && cp docker/demo-server.js out/docker/ \
 && for id in $(echo "$VITE_MODULES" | tr , ' '); do \
      if [ -d "src/modules/$id/mocks" ]; then \
        mkdir -p "out/src/modules/$id" && cp -r "src/modules/$id/mocks" "out/src/modules/$id/"; \
      fi; \
    done

FROM node:26-alpine AS demo
WORKDIR /app
COPY --from=demo-build /app/out/ ./
ARG VITE_MODULES
ENV VITE_MODULES=$VITE_MODULES
EXPOSE 80
CMD ["node", "docker/demo-server.js"]

FROM nginx:1.27-alpine AS console
COPY deploy/nginx/snippets/ /etc/nginx/snippets/
COPY docker/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
ENV NETXMS_WEBAPI=netxms-server:8000
EXPOSE 80
