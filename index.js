// Copyright 2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

var di = require('di'),
    _ = require('lodash'),
    core = require('on-core')(di),
    injector = new di.Injector(
        _.flatten([
            core.injectables
        ])
    ),
    Logger = injector.get('Logger');

var logger = Logger.initialize('Dhcp');
