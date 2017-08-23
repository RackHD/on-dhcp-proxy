# Copyright 2016, EMC, Inc.

ARG repo=rackhd
ARG tag=devel

FROM ${repo}/on-core:${tag}

COPY . /RackHD/on-dhcp-proxy/
WORKDIR /RackHD/on-dhcp-proxy

RUN mkdir -p ./node_modules \
  && ln -s /RackHD/on-core ./node_modules/on-core \
  && ln -s /RackHD/on-core/node_modules/di ./node_modules/di \
  && npm install --ignore-scripts --production

EXPOSE 68/udp 4011
CMD [ "node", "/RackHD/on-dhcp-proxy/index.js" ]
