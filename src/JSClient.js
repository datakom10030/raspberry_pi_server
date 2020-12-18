/***********************************************************************************************************************
 * JS ROBOT CLIENT
 * THIS IS A PROGRAM FOR TESTING OF THE ROBOT SERVER
 * WRITTEN AS A PART OF THE SUBJECT IELEA2001
 ***********************************************************************************************************************/

const io = require('socket.io-client');

/***********************************************************************************************************************
 * TEST PARAMETERS
 ***********************************************************************************************************************/
// const sensorIDs = ['#####1', '#####2','#####3', '#####4'];
// These setpoints are what the robot uses if it can't connect to the server!!!
let sensors = {
    '#####1': {
        'setpoint': 0,
        'controlledItem': false,

    },
    '#####2': {
        'setpoint': 0,
        'controlledItem': false,
    },
    '#####3': {
        'setpoint': 0,
        'controlledItem': false,
    },
    '#####4': {
        'setpoint': 0,
        'controlledItem': false,
    },
}
const serverURI = 'http://192.168.137.105:3000'; // Alternative: http://localhost:3000/webserver
const sendingOfRandomData = true;
const sendingData = true;
const admin = false;
const robotID = 'unit1';

/***********************************************************************************************************************
 * MAIN PROGRAM
 ***********************************************************************************************************************/

// Connect to the server specified
const socket = io(serverURI, {
    reconnectionDelayMax: 10000,
    //namespace: '/admin',
});


socket.on('connect', () => {
    console.log(socket.id);
    console.log(socket.nsp);
    if (admin) {
        let myVarNew = setInterval(getData, 3000);
    }
    socket.emit('authentication', "123456789");
    if (sendingData) {
        if (sendingOfRandomData) {
            // The interval is how often the function is executed in ms
            let myVar = setInterval(sendTemperature, 3000);
        } else {
            let numberOfRecords = 100;
            Object.keys(sensors).map((sensor) => {
                let record = 0;
                for (record = 0; record < numberOfRecords; record++) {
                    let stringToSend = '{ "sensorID": "' + sensor + '", "value": ' + record + '}';
                    socket.emit('sensorData', stringToSend);
                    console.log('sending data for sensor: ' + sensor + ' Value: ' + record);
                }
            });
        }
    }
});


socket.on('authentication', (feedback) => {
    // Send the robot ID to the server if authentication is successfully
    if (feedback) {
        socket.emit('robotID', robotID);
    } else {
        // Else disconnect from the server
        socket.disconnect();
    }
});


socket.on('setpoints', (setpoints) => {
    // Set new setpoint for the sensors connected to the robot
    let newSetpoints = JSON.parse(setpoints);
    Object.keys(newSetpoints).map((sensor) => {
        // Check if the sensor is connected to the robot
        if (sensors[sensor] !== undefined) {
            // Set new setpoint to the server
            sensors[sensor].setpoint = newSetpoints[sensor];
        }
    });
})


socket.on('connected', () => {

});

socket.on('clientConnected', (data, tefdg) => {
    console.log(data + " " + tefdg); // 'G5p5...'
})


/***********************************************************************************************************************
 * FUNCTIONS
 ***********************************************************************************************************************/

function sendTemperature() {
    // Make a random temperature between 20 and 30 degrees
    let temperatureToSend = 20 + 10 * Math.random();

    // Select a random sensor ID
    // numberOfSensors(randomNum) round to closest int...
    let sensorNumber = Math.floor(Math.random() * Object.keys(sensors).length);
    let sensorID = Object.keys(sensors)[sensorNumber];
    let stringToSend = '{ "SensorID": "' + sensorID + '", "value": ' + temperatureToSend.toFixed(2) + '}';

    // check if the sensorValue is over or below the setpoint
    let controlItem = true;
    if (temperatureToSend < sensors[sensorID].setpoint) {
        controlItem = false;
    }

    if (controlItem !== sensors[sensorID].controlledItem) {
        sensors[sensorID].controlledItem = controlItem;
        let controlObject = {
            'ControlledItemID': sensorID,
            'value': controlItem
        }
        let controlString =  JSON.stringify(controlObject);

        socket.emit('sensorData',controlString);
        console.log("Sending control data: " + controlString);

    } else {

    }

    socket.emit('sensorData', stringToSend);
    console.log("Sending temperature data: " + stringToSend);
};


function getData() {
    let setting = {
        timeInterval: 0,
        unitIDs: 1,
        sensorIDs: 1
    }
    const dataSetting = JSON.stringify(setting);
    socket.emit('getData', dataSetting);
}

