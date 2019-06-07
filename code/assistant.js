/////////////
//VARIABLES//
/////////////
var mqtt = require('mqtt');
var client = mqtt.connect('mqtt://localhost',{port:1883});
var relay = require('./relay.js');
var snipsUsername = 'ENTER USERNAME';
var wakeword = 'hermes/hotword/default/detected';
var sessionEnd = 'hermes/dialogueManager/sessionEnded';
var thermostat = 'hermes/intent/' + snipsUsername +':thermostat';

//snips method to respond
client.snipsRespond = function(payload){
    client.publish('hermes/dialogueManager/endSession', JSON.stringify({
      sessionId: payload.sessionId,
      text: payload.text
    }));
};

//////////////
//ON CONNECT//
//////////////
client.on('connect', function(){
    console.log('Connected to snips mqtt server\n');
    client.subscribe(wakeword);
    client.subscribe(sessionEnd);
    client.subscribe(thermostat);
});
client.on('message', function(topic,message) {
    var message = JSON.parse(message);
switch(topic){
        // * On Wakeword
        case wakeword:
            relay.startWaiting();
            console.log('Wakeword Detected');
        break;
        // * On Thermostat call
        case thermostat:
            try{
                //tell the temperature
                if(message.slots[0].value.value === 'read')
                {
                    relay.tellTemp();
                    //respond with the temperature
                    client.snipsRespond({
                        sessionId: message.sessionId,
                        text: "The current temperature is "+ Math.floor(relay.currentTemperature()) + " degrees Celsius"
                    });
                    relay.sleep(3000);
                    relay.stopWaiting();
                }
                //set the temperature to a certain number
                else if(message.slots[0].value.value === 'set'  && message.slots[1].value.kind === 'Number')
                {
                    relay.makeTemp(message.slots[1].value.value-1,message.slots[1].value.value+1);
                    relay.stopWaiting();
                }
                else{
                    relay.stopWaiting();
                }
            }
            // Expect error if nothing is understood
            catch(e){
                console.log(e);
            }
        break;

        // * On Conversation End
        case sessionEnd:
            relay.stopWaiting();
            console.log('session ended\n');
        break;
    }
});

