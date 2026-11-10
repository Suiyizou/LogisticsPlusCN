import test from'node:test';import assert from'node:assert/strict';
import{overviewTiming,overviewReference}from'../public/tracking-overview-facts.mjs';
import{sourceBusinessFields}from'../public/tracking-source-fields.mjs';
import{normalizeTrackingLocation}from'../public/tracking-location-normalizer.mjs';
test('blank leg fields cannot hide reported ETD and ETA; container times remain container-only',()=>{
 const snapshot={routingLegs:[{estimatedDeparture:'',estimatedArrival:''}],keyTimes:{},sourceDetails:{fields:[{key:'eta',source:'shipment.containers.0',value:'2099-01-01'},{key:'etd',source:'shipment.fields',value:'03 Aug 2026'},{key:'eta',source:'shipment.fields',value:'19 Aug 2026'}]}};
 assert.equal(overviewTiming(snapshot).departureTime,'03 Aug 2026');assert.equal(overviewTiming(snapshot).arrivalTime,'19 Aug 2026');assert.equal(overviewTiming(snapshot).arrivalIsActual,false);
 snapshot.keyTimes.actualArrival={time:'18 Aug 2026'};assert.equal(overviewTiming(snapshot).arrivalTime,'18 Aug 2026');assert.equal(overviewTiming(snapshot).arrivalIsActual,true);
});
test('an invalid source label is not displayed as a shipment number or replaced with another reference type',()=>{
 assert.equal(overviewReference({query:{number:'CONFIRMED',type:'BOOKING'},snapshot:{references:{bookingNumbers:['OOLU12345678']}}}),'OOLU12345678');
 assert.equal(overviewReference({query:{number:'CONFIRMED',type:'BOOKING'},snapshot:{references:{masterBill:'BILL1234'}}}),'');
});
test('explicit country suffix supplies a flag without guessing an unknown port code',()=>{
 assert.equal(normalizeTrackingLocation({name:'YANTIAN, CHINA (CN)'}).countryCode,'CN');
 assert.equal(normalizeTrackingLocation({name:'UNKNOWN PORT, CHINA (CN)'}).countryCode,'CN');
 assert.equal(normalizeTrackingLocation({name:'UNKNOWN PORT, CHINA (CN)'}).unLocationCode,undefined);
 assert.equal(normalizeTrackingLocation({name:'UNKNOWN PORT, CHINA (US)'}).countryCode,undefined);
});
test('business facts collapse duplicates and omit technical fields and repeated event rows',()=>{
 const fields=[{key:'origin_terminal',value:'NINGBO TERMINAL',source:'shipment.fields'},{key:'origin_terminal',value:'NINGBO TERMINAL',source:'shipment.fields_extra'},...['source','time_type','raw','time_basis','vessel','container_numbers'].map(key=>({key,value:'TECHNICAL'})),{key:'origin_terminal',value:'OTHER EVENT TERMINAL',source:'shipment.containers.0.events.1'},{key:'seal',value:'SEAL123',source:'shipment.fields'}];
 assert.deepEqual(sourceBusinessFields({sourceDetails:{fields}},'zh'),[{label:'起运码头',value:'NINGBO TERMINAL'},{label:'封条号',value:'SEAL123'}]);
});
