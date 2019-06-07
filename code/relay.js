/////////////
//VARIABLES//
/////////////
var zmq = require('zeromq');// Asynchronous Messaging Framework
var matrix_io = require('matrix-protos').matrix_io;// Protocol Buffers for MATRIX function
var matrix_ip = '127.0.0.1';// Local IP
var matrix_gpio_base_port = 20049;// Port for GPIO driver
var matrix_humidity_base_port = 20017;// Port for Humidity Sensor driver 
var matrix_pressure_base_port = 20025;// Port for Pressure Sensor driver
var matrix_everloop_base_port = 20021;// Port for Everloop driver
var methods = {}; //methods object
var relayPin1 = 0;
var relayPin2 = 1;
//initialize the global variables//

var currentTemperature = 0; //store the current temperature
//create the offset temperatures (usually 1 degree above and below the desired temperature)
var temperatureOffset1 = 0;
var temperatureOffset2 = 0;
//create variables that hold the humidity and pressure temperature sensor readings
var humidityTemperature = 0;
var pressureTemperature = 0;
var image = matrix_io.malos.v1.io.EverloopImage.create();//create the everloop image
var matrix_device_leds = 35;// Holds amount of LEDs on MATRIX device
var waitingToggle = false;
var counter = 0;
var lowestTemperature = 10; //holds the lowest temperature wanted (be mindful of farenheit /celsius conversions)
var highestTemperature = 30; //holds the highest temperature wanted (be mindful of farenheit /celsius conversions)

/////////////
//BASE PORT//
/////////////

//create the GPIO, humidity sensor, pressure sensor, and everloop push sockets
var GpioConfigSocket = zmq.socket('push');
var humidityConfigSocket = zmq.socket('push');
var everloopConfigSocket = zmq.socket('push');
var pressureConfigSocket = zmq.socket('push');

//connect the sockets to their respective base ports
GpioConfigSocket.connect('tcp://' + matrix_ip + ':' + matrix_gpio_base_port);
humidityConfigSocket.connect('tcp://' + matrix_ip + ':' + matrix_humidity_base_port);
everloopConfigSocket.connect('tcp://' + matrix_ip + ':' + matrix_everloop_base_port);
pressureConfigSocket.connect('tcp://' + matrix_ip + ':' + matrix_pressure_base_port);

// Create driver configurations

var gpioOutputConfig1 = matrix_io.malos.v1.driver.DriverConfig.create({
    // Update rate configuration
    delayBetweenUpdates: 0.1,// 0.1 seconds between updates   
    timeoutAfterLastPing: 6.0,// Stop sending updates 6 seconds after pings
    //GPIO Configuration for pin 0
    gpio: matrix_io.malos.v1.io.GpioParams.create({
        pin: relayPin1, // Use pin 0 to control the first relay (the relay that controls the cooler)
        mode: matrix_io.malos.v1.io.GpioParams.EnumMode.OUTPUT,
        value: 1
    }),
});

var gpioOutputConfig2 = matrix_io.malos.v1.driver.DriverConfig.create({
    // Update rate configuration
    delayBetweenUpdates: 0.1,// 0.1 seconds between updates    
    timeoutAfterLastPing: 6.0,// Stop sending updates 6 seconds after pings
    //GPIO Configuration for pin 1
    gpio: matrix_io.malos.v1.io.GpioParams.create({
        pin: relayPin2,  // Use pin 1 to control the first relay (the relay that controls the heater)
        mode: matrix_io.malos.v1.io.GpioParams.EnumMode.OUTPUT,
        value: 1
    }),
});

//create the configuration for the humidity sensor
var tempConfig = matrix_io.malos.v1.driver.DriverConfig.create({
    // Update rate configuration
    delayBetweenUpdates:  0.1,// 0.1 seconds between updates 
    timeoutAfterLastPing: 6.0,// Stop sending updates 6 seconds after pings
    humidity: matrix_io.malos.v1.sense.HumidityParams.create({
        currentTemperature: 21.1
    })
});

//create the configuration for the pressure sensor
var pressureConfig = matrix_io.malos.v1.driver.DriverConfig.create({
    // Update rate configuration
    delayBetweenUpdates:  0.1,// 0.1 seconds between updates 
    timeoutAfterLastPing: 6.0,// Stop sending updates 6 seconds after pings
});

///////////////////
//KEEP ALIVE PORT//
///////////////////
// Create a Pusher socket
var gpioPingSocket = zmq.socket('push');
var humidityPingSocket = zmq.socket('push');
var everloopPingSocket = zmq.socket('push');
var pressurePingSocket = zmq.socket('push');

//connect the pushers to the stay alive port for their respective sensor
gpioPingSocket.connect('tcp://' + matrix_ip + ':' + (matrix_gpio_base_port +1));
humidityPingSocket.connect('tcp://' + matrix_ip + ':' + (matrix_humidity_base_port+1));
everloopPingSocket.connect('tcp://' + matrix_ip + ':' + (matrix_everloop_base_port + 1));
pressurePingSocket.connect('tcp://' + matrix_ip + ':' + (matrix_pressure_base_port+1));

//send the initial ping
gpioPingSocket.send('');
humidityPingSocket.send('');
everloopPingSocket.send('');
pressurePingSocket.send('');

//send pings every 2 seconds
setInterval(function(){
    humidityPingSocket.send('');
    gpioPingSocket.send('');
    everloopPingSocket.send('');
    pressurePingSocket.send('');
}, 2000);

//send the initial configurations for each sensor through their respective configSocket
GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig1).finish());
GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig2).finish());
humidityConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(tempConfig).finish());
pressureConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(pressureConfig).finish());

//////////////
//ERROR PORTS/
//////////////
// Create a Subscriber socket
var pressureErrorSocket = zmq.socket('sub');
var humidityErrorSocket = zmq.socket('sub');
var gpioErrorSocket = zmq.socket('sub');
var everloopErrorSocket = zmq.socket('sub');
// Connect Subscriber to Error port
gpioErrorSocket.connect('tcp://' + matrix_ip + ':' + (matrix_gpio_base_port + 2));
everloopErrorSocket.connect('tcp://' + matrix_ip + ':' + (matrix_everloop_base_port + 2));
pressureErrorSocket.connect('tcp://' + matrix_ip + ':' + (matrix_pressure_base_port + 2));
humidityErrorSocket.connect('tcp://' + matrix_ip + ':' + (matrix_humidity_base_port + 2));
// Connect Subscriber to Error port
gpioErrorSocket.subscribe('');
everloopErrorSocket.subscribe('');
pressureErrorSocket.subscribe('');
humidityErrorSocket.subscribe('');
// On Message
pressureErrorSocket.on('message', function(error_message){
   console.log('Error received: ' + error_message.toString('utf8'));// Log error
});
humidityErrorSocket.on('message', function(error_message){
    console.log('Error received: ' + error_message.toString('utf8'));// Log error
});
gpioErrorSocket.on('message', function(error_message){
    console.log('Error received: ' + error_message.toString('utf8'));// Log error
});
everloopErrorSocket.on('message', function(error_message){
   console.log('Error received: ' + error_message.toString('utf8'));// Log error
});

////////////////////
//DATA UPDATE PORT//
////////////////////

// Create a Subscriber socket
var gpioUpdateSocket = zmq.socket('sub');
var humidityUpdateSocket = zmq.socket('sub');
var everloopUpdateSocket = zmq.socket('sub');
var pressureUpdateSocket = zmq.socket('sub');
// Connect Subscriber to Data Update port
humidityUpdateSocket.connect('tcp://' + matrix_ip + ':' + (matrix_humidity_base_port+3));
gpioUpdateSocket.connect('tcp://' + matrix_ip + ':' + (matrix_gpio_base_port+3));
everloopUpdateSocket.connect('tcp://' + matrix_ip + ':' + (matrix_everloop_base_port + 3));
pressureUpdateSocket.connect('tcp://' + matrix_ip + ':' + (matrix_pressure_base_port +3));
// Subscribe to messages
humidityUpdateSocket.subscribe('');
gpioUpdateSocket.subscribe('');
everloopUpdateSocket.subscribe('');
pressureUpdateSocket.subscribe('');
// On Message
humidityUpdateSocket.on('message', function(buffer){
    var temp = matrix_io.malos.v1.sense.Humidity.decode(buffer);
    //set the humidityTemperature variable to half the raw temperature of the sensor
     humidityTemperature = temp.temperatureRaw;
    currentTemperature = ((humidityTemperature + pressureTemperature)/2)-13; //equation to calculate the current temperature
   
})
gpioUpdateSocket.on('message', function(buffer){
    //output the GPIO pin values as a string
    var data = matrix_io.malos.v1.io.GpioParams.decode(buffer);
    var zeros = '0000000000000000';
    var gpioValues = zeros.slice(0, zeros.length - data.values.toString(2).length);
    gpioValues = gpioValues.concat(data.values.toString(2));
    gpioValues = gpioValues.split("").reverse();
    console.log('GPIO PINS-->[0-15]\n' +'['+gpioValues.toString()+']');
})
everloopUpdateSocket.on('message', function(buffer){
    var data = matrix_io.malos.v1.io.EverloopImage.decode(buffer);// Extract message
    matrix_device_leds = data.everloopLength;// Save MATRIX device LED count
});
pressureUpdateSocket.on('message', function(buffer){
    var data = matrix_io.malos.v1.sense.Pressure.decode(buffer); //extract message
    pressureTemperature = data.temperature; //set pressureTemperature to the pressure sensor temperature
    currentTemperature = ((humidityTemperature + pressureTemperature)/2)-13; //equation to calculate the current temperature
    console.log(currentTemperature);
});


setInterval(function(){
    // Turns off all LEDs
    if (!waitingToggle) {
        for (var i = 0; i < matrix_device_leds; ++i) {
            // Set individual LED value
            image.led[i] = {
                red: 0,
                green: 0,
                blue: 0,
                white: 0
            };
        }
        var config = matrix_io.malos.v1.driver.DriverConfig.create({
            'image': image
        })
        if(matrix_device_leds > 0) {
            everloopConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(config).finish());
        }   
    }
    // Creates pulsing LED effect
    else if (waitingToggle) {
        for (var i = 0; i < 35; ++i) {
            // Set individual LED value
        
            image.led[i] = {
                red: 0,
                green: 0,
                blue: 255,// Math used to make pulsing effect
                white: 0
            };
           methods.sleep(10);
    // Store the Everloop image in MATRIX configuration
    var config = matrix_io.malos.v1.driver.DriverConfig.create({
        'image': image
    });
    // Send MATRIX configuration to MATRIX device
    if(matrix_device_leds > 0) {
        everloopConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(config).finish());
    };   
    }
    }
},50);

///////////////////
/////METHODS///////
///////////////////
methods.startWaiting = function() {
   waitingToggle = true;
};
methods.stopWaiting = function() {
   waitingToggle = false;
};

//the temperature setting method
methods.makeTemp = function(temp1, temp2){
     //set the first and second temperature offsets to a degree greater and less than the desired temperature
    temperatureOffset1 = temp1;
    temperatureOffset2 = temp2;
    if(currentTemperature < temperatureOffset1)
    {
            //set the first relay on and turn off the other
            gpioOutputConfig1.gpio.value = 0;
            gpioOutputConfig2.gpio.value = 1;
            GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig1).finish());
            GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig2).finish());

            //log the current temperature and the offsets
            console.log(currentTemperature);
            console.log(temperatureOffset1);
            console.log(temperatureOffset2);

            //wait a second and then call the makeTemp function again to check the temperature
            setTimeout(function(){
               methods.makeTemp(temperatureOffset1,temperatureOffset2);
            }, 1000);
    }
    else if(currentTemperature > temperatureOffset2)
    {
            //set the second relay on and turn off the other
            gpioOutputConfig1.gpio.value = 1;
            gpioOutputConfig2.gpio.value = 0;
            GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig1).finish());
            GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig2).finish());
            
            //log the current temperature and the offsets
            console.log(currentTemperature);
            console.log(temperatureOffset1);
            console.log(temperatureOffset2);

            //wait a second and then call the makeTemp function again to check the temperature
            setTimeout(function(){
               methods.makeTemp(temperatureOffset1,temperatureOffset2);
            }, 1000);
    }
    else{
        //log the current temperature
        console.log(currentTemperature);

        //turn off both relays
        gpioOutputConfig1.gpio.value = 1;
        gpioOutputConfig2.gpio.value = 1;
        GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig1).finish());
        GpioConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(gpioOutputConfig2).finish());

        //after a second check the temperature again for any changes
        setTimeout(function(){
            methods.makeTemp(temperatureOffset1,temperatureOffset2);
         }, 1000);
    }
};

//create a simple sleep method
methods.sleep = function(milliseconds) {
    var start = new Date().getTime();
    while ((new Date().getTime() - start) < milliseconds){
    }
}

//create a method to return the current temperature
methods.currentTemperature = function(){
    return currentTemperature;
}

//the method to tell the temperature through the leds
methods.tellTemp = function(){    
    for (var i = 0; i < 35; ++i){
        if((currentTemperature <= highestTemperature && currentTemperature >= lowestTemperature))
        {
            if(i <= ((currentTemperature-lowestTemperature)*(35/(highestTemperature-lowestTemperature)))) //represent temperature through leds
            {
                // Set individual LED value
                image.led[i] = {
                red: (255)/(Math.exp(-0.3*i+5)+1) - 1,
                green: 0,
                blue: -255/(Math.exp(-0.3*i +5) +1) +255,
                white: 0
                };
            }
            else{
                //make the rest of the leds blank
                image.led[i] = {
                    red: 0,
                    blue: 0,
                    green: 0,
                    white: 0
                }
            }
        }
        else if(currentTemperature > highestTemperature)
        {
            //change all leds to red
            image.led[i] = {
                red: 255,
                green: 0,
                blue: 0,
                white: 0
            };
        }
        else if(currentTemperature < lowestTemperature)
        {
            //change all leds to blue
            image.led[i] = {
                red: 0,
                green: 0,
                blue: 255,
                white: 0
            };
        }
    }  
     // Store the Everloop image in MATRIX configuration
    var config = matrix_io.malos.v1.driver.DriverConfig.create({
        'image': image
    });
    // Send MATRIX configuration to MATRIX device
    everloopConfigSocket.send(matrix_io.malos.v1.driver.DriverConfig.encode(config).finish());
};

module.exports = methods;// Export methods in order to make them avaialble to other files 