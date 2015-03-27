// Copyright 2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

var di = require('di'),
    _ = require('lodash'),
    core = require('on-core')(di),
    injector = new di.Injector(
        _.flatten([
            core.injectables,
            core.helper.requireGlob(__dirname + '/lib/**/*.js')
        ])
    ),
    Logger = injector.get('Logger'),
    logger = Logger.initialize('Dhcp'),
    Server = injector.get('DHCP.Proxy.Server');

var server = Server.create(4011, 68, '10.1.1.1', '10.1.1.255');

try {
    server.start();
    logger.info("Starting Proxy DHCP server on 10.1.1.1:4011");
} catch (e) {
    logger.error("Error starting server", {
        error: e
    });
    process.nextTick(function() {
        process.exit(1);
    });
}
