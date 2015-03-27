// Copyright 2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

var di = require('di'),
    dgram = require('dgram');

module.exports = serverFactory;
di.annotate(serverFactory, new di.Provide('DHCP.Proxy.Server'));
di.annotate(serverFactory, new di.Inject(
        'DHCP.messageHandler',
        'Logger'
    )
);
function serverFactory(messageHandler, Logger) {
    var logger = Logger.initialize(Server);

    function Server(inPort, outPort, address, broadcastAddress) {
        this.server = dgram.createSocket('udp4');
        this.inPort = inPort;
        this.outPort = outPort;
        this.address = address;
        this.broadcastAddress = broadcastAddress;
    }

    Server.prototype.send = function(data) {
        var packetBuffer = data.packetBuffer;
        var destination = data.destination || this.broadcastAddress;
        var sendCallback = function(err) {
            if (err) {
                logger.error('Error sending packet: ' + err);
            }
        };

        this.server.send(packetBuffer, 0, packetBuffer.length, this.outPort,
                destination, sendCallback);
    };

    Server.prototype.start = function() {
        var self = this;

        self.server.on('message', function(packet) {
            messageHandler.handleDhcpPacket(packet, self.send);
        });

        self.server.on('error', function(err) {
            logger.emerg("proxyDHCP server error: ", err);
            process.nextTick(function() {
                process.exit(1);
            });
        });

        self.server.bind(this.inPort, '0.0.0.0', function() {
            // TODO (benbp): re-integrate bound-socket library
            logger.info('proxyDHCP server is listening on 0.0.0.0:' + self.inPort);
            self.server.setBroadcast(true);
        });
    };

    Server.prototype.stop = function() {
        this.server.close();
        this.server.removeAllListeners();
    };

    Server.create = function(inPort, outPort, address, broadcastAddress) {
        return new Server(inPort, outPort, address, broadcastAddress);
    };

    return Server;
}
