// Copyright 2014-2015, Renasar Technologies Inc.
/* jshint node: true */

"use strict";

before('DHCP server before', function() {
    helper.setupInjector(
        [
            helper.require('/lib/message-handler')
        ]
    );
    var Logger = helper.injector.get('Logger');
    Logger.prototype.log = sinon.stub();
});

describe("DHCP Message Handler", function() {
    it("should pass", function() {
        console.log(1);
    });
});
