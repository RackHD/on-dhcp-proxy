// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Parser", function() {

    var parser;

    before('Parser before', function() {
        helper.setupInjector(
            [
                helper.require('/lib/parser'),
                helper.require('/lib/dhcp-protocol')
            ]
        );
        var Logger = helper.injector.get('Logger');
        Logger.prototype.log = sinon.stub();
        parser = helper.injector.get('DHCP.parser');
    });

    describe('trimNulls Function', function() {

        it("should do something with the string");

    });

    describe('readIpRaw Function', function() {
        it("should return undefined if the msg offset is 0", function() {
            var msg = new Buffer(2);
            var offset = 0;
            msg[0] = 0x0;

            expect(parser.readIpRaw(msg, offset)).to.be.an('undefined');
        });

        it("should return the msg as a string seperated by \'.\'", function() {
            var msg = new Buffer(4);
            var offset = 0;
            msg[0] = 0x3;
            msg[1] = 0x4;
            msg[2] = 0x5;
            msg[3] = 0x6;

            expect(parser.readIpRaw(msg, offset)).to.be.equal("3.4.5.6");
        });

        it("should return undefined if the offset is not 4 or greater", function() {
            var msg = new Buffer(3);
            var offset = 0;
            msg[0] = 0x3;
            msg[1] = 0x4;
            msg[2] = 0x5;

            expect(parser.readIpRaw(msg, offset)).to.be.an('undefined');
        });
    });

    describe('readString Function', function() {

    });


    describe('readAddressRaw Function', function() {

        it("should return the address when the length is equal to or less than 0", function() {
            var msg = "";
            var offset = 0;

            var address = parser.readAddressRaw(msg, offset, 0);
            expect(address).to.be.empty;
        });

        it("should return the address when the length is greater 0 it will add a \':\' to the address", function() {
            var msg = new Buffer(2);
            var offset = 0;
            msg[0] = 0x3;
            msg[1] = 0x4;

            var address = parser.readAddressRaw(msg, offset, 2);
            expect(address).to.contain(":");
        })
    });

    //there are over 100 case statements in this function
    describe('Parse Function', function() {

    });

});