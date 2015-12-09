// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Dhcp Protocol", function() {

    before('Dhcp Protocol before', function() {
        helper.setupInjector(
            [
                helper.require('/lib/packet')
            ]
        );
        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.stub();
    });

    it("needs specs");

});

