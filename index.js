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
    core = injector.get('Services.Core'),
    configuration = injector.get('Services.Configuration'),
    Logger = injector.get('Logger'),
    logger = Logger.initialize('Dhcp'),
    Server = injector.get('DHCP.Proxy.Server');

core.start()
.then(function() {
    Server.create(
        configuration.get('dhcpProxyInPort', 4011),
        configuration.get('dhcpProxyOutPort', 68),
        configuration.get('server')
    ).start();
})
.catch(function(e) {
    logger.error("Error starting server", {
        error: e
    });
    process.nextTick(function() {
        process.exit(1);
    });
});
