// Copyright 2015, EMC, Inc.
/* jshint node: true */

"use strict";

describe("Parser", function() {

    var parser;
    var msg;
    var offset;


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
            msg = new Buffer(2);
            offset = 0;
            msg[0] = 0x0;

            expect(parser.readIpRaw(msg, offset)).to.be.an('undefined');
        });

        it("should return the msg as a string seperated by \'.\'", function() {
            msg = new Buffer(4);
            offset = 0;
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

    describe('ReadIp Function', function() {
        beforeEach("ReadIp beforeEach", function() {
            msg = new Buffer(3);
            offset = 0;
            msg[0] = 0x4;

            parser.packet = {
                options: {}
            };
        });

        it("should return the offset plus the len and update the packet options names", function() {
            var len = msg.readUInt8(offset);

            expect(parser.readIp(msg, offset, "test_name")).to.equal(offset+len+1);
        });

        it("should throw assert false if the length does not equal 4", function() {
            expect(function() {
                msg[0] = 0x3;

                parser.readIp(msg, offset, "test_name");
            }).to.throw(Error, '3 === 4');
        });

        it("should update the packet options names", function(){
            var len = msg.readUInt8(offset);

            expect(parser.readIp(msg, offset, "test_name")).to.equal(offset+len+1);
            expect(parser.packet.options).to.include.keys("test_name");
        });
    });

    describe('ReadString Function', function() {

        beforeEach("ReadString beforeEach", function() {
            msg = new Buffer(3);
            offset = 0;
            msg[0] = 0x3;

            parser.packet = {
                options: {}
            };
        });

        it("should return the offset and update the packet options names", function() {
            var len = msg.readUInt8(offset);

            expect(parser.readString(msg, offset, "test_name")).to.equal(offset+len+1);
        });

        it("should update the packet options names", function(){
            var len = msg.readUInt8(offset);

            expect(parser.readString(msg, offset, "test_name")).to.equal(offset+len+1);
            expect(parser.packet.options).to.include.keys("test_name");
        });


    });


    describe('readAddressRaw Function', function() {

        it("should return the address when the length is equal to or less than 0", function() {
            var msg = "";
            var offset = 0;

            var address = parser.readAddressRaw(msg, offset, 0);
            expect(address).to.be.empty;
        });

        it("should return the address when the length is greater 0 it will add a \':\' to the address", function() {
            msg = new Buffer(2);
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