FROM rackhd/on-core

RUN mkdir -p /RackHD/on-dhcp-proxy
WORKDIR /RackHD/on-dhcp-proxy

COPY ./package.json /tmp/
RUN cd /tmp \
  && ln -s /RackHD/on-core /tmp/node_modules/on-core \
  && ln -s /RackHD/on-core/node_modules/di /tmp/node_modules/di \
  && npm install --ignore-scripts --production

COPY . /RackHD/on-dhcp-proxy/
RUN cp -a /tmp/node_modules /RackHD/on-dhcp-proxy/

EXPOSE 68
EXPOSE 68/udp
EXPOSE 4011

ENTRYPOINT [ "node" ]
CMD [ "/RackHD/on-dhcp-proxy/index.js" ]
