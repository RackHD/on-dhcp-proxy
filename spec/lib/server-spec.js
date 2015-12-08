// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Server", function() {

    before('Server before', function() {
        helper.setupInjector(
            [
                helper.require('/lib/packet')
            ]
        );
        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.stub();
    });

});