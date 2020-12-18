/***********************************************************************************************************************
 * ROBOT SERVER
 * THIS IS A PROGRAM FOR CONTROLLING ROBOTS AND COMMUNICATING WITH A WEBSERVER
 * WRITTEN AS A PART OF THE SUBJECT IELEA2001
 ***********************************************************************************************************************/

/*********************************************************************
 * IMPORTS AND CONSTANTS
 *********************************************************************/

const app = require('express')();
const server = require('http').createServer(app);
const io = require('socket.io').listen(server);
const _ = require('underscore');
const fs = require('fs');


const sensorDatabase = 'database/sensor-data.json'; // This is the path to the sensor database
const controlledItemDatabase = 'database/controlled-item-data.json'; // This is the path to the controlled item database

const databasePaths = {
    SensorID: sensorDatabase,
    ControlledItemID: controlledItemDatabase
};


// Import config files
const sensorConfigPath = 'config/sensor-config.json';
const robotConfigPath = 'config/robot-config.json';
const robotConfig = getDatabaseSync(robotConfigPath);
const sensorConfig = getDatabaseSync(sensorConfigPath);

let newSensorData = {       // Object for storing data received from robots in the same structure as the database
    SensorID: {},           // Make the SensorID object
    ControlledItemID: {}    // Make the ControlledItemID object
};

const safeRobotRoom = 'safeRobots';
// Define all passcodes that can be used by robots in the array below
let unusedPasscodes = ["123456789", "123456788"];
let robotsConnected = {};
let webserverNamespace = io.of('/webserver');
let robotNamespace = io.of('/robot');
// const adminNamespace = io.of('/admin'); //Not used, there is no admin rights at the moment

const serverPort = 3000;


/*********************************************************************
 * MAIN PROGRAM
 *********************************************************************/

webserverNamespace.use((socket, next) => {
    // This happens before the 'connection' event, you can add authentication for web clients here
    // ensure the user has sufficient rights
    console.log("Client from webserver connected");
    next();
});


// If there is an connection from an webclient this runs
webserverNamespace.on('connection', socket => {
    // This is the event for sending of historical data
    socket.on('getData', settings => {
        //addDataToDB(sensorDatabase, newSensorData);
        console.log('Data request received from a webpage')
        let startTime = 0;   // Default start time is 0ms
        let stopTime = 0;    // Default stop time is 0ms
        let sensorID;        // There NO default sensor
        let dataType = 'SensorID' // Default datatype is sensor id
        let parsedSettings = JSON.parse(settings)

        // Change the default parameters if they are specified
        if (parsedSettings.hasOwnProperty('startTime')) {
            startTime = parsedSettings.startTime;
        }
        if (parsedSettings.hasOwnProperty('stopTime')) {
            stopTime = parsedSettings.stopTime;
        }
        if (parsedSettings.hasOwnProperty('dataType')) {
            dataType = parsedSettings.dataType;
        }
        // If there is no sensor ID there are no sensor data to retrieve
        if (parsedSettings.hasOwnProperty('sensorID')) {
            sensorID = parsedSettings.sensorID;
            // Get the sensor data
            getData(startTime, stopTime, sensorID, dataType, (sensorData) => {
                // Sort the data by time
                let sortedData = _.sortBy(sensorData, 'time');

                let dataToSend = {};
                // The data is sent as an object under the name of the sensor and the datatype
                dataToSend[dataType] = {};
                dataToSend[dataType][sensorID] = sortedData;

                let encodedData = JSON.stringify(dataToSend);
                socket.emit('dataResponse', encodedData);
            });
        }
    });
    
    // Event for sending the configuration of the specified sensor
    socket.on('sensorInfo', (sensorID, callback) => {
        //console.log(sensorID);
        let sensorInfo = {};
        sensorInfo[sensorID] = sensorConfig['sensor-config'][sensorID]

        socket.emit('sensorInfo', JSON.stringify(sensorInfo), callback);
    });
    
    // Event for sending the configuration of the specified robot
    socket.on('robotInfo', (robotID, callback) => {
        //console.log(robotID);
        let robotInfo = {};
        robotInfo[robotID] = robotConfig['robot-config'][robotID]

        socket.emit('robotInfo', JSON.stringify(robotInfo), callback);
    });
    
    // Event for sending of all the sensorIDs in the config
    socket.on('allSensors', (call) => {
        // Send all the sensors to the client
        if (call) {
            console.log(call);
            // Variable to store all the sensorIDs
            let sensorNames = [];
            // Loop thru all the sensors to add all the names
            Object.keys(sensorConfig['sensor-config']).map((sensor) => {
                // Add all sensorIDs to the array
                sensorNames.push(sensor);
            });
            // Send all the sensorIDs to the client that asked

            let sensorNamesToSend = _.sortBy(sensorNames);
            socket.emit('allSensors', JSON.stringify(sensorNamesToSend));
        }
    });

    // Event for sending of all the robotIDs in the config
    socket.on('allRobots', (call) => {
        // Send all the sensors to the client
        if (call) {
            console.log(call);
            // Variable to store all the sensorIDs
            let robotNames = [];
            // Loop thru all the sensors to add all the names
            Object.keys(robotConfig['robot-config']).map((robot) => {
                // Add all sensorIDs to the array
                robotNames.push(robot);
            });
            // Send all the sensorIDs to the client that asked
            let robotNamesToSend = JSON.stringify(robotNames)
            socket.emit('allRobots', robotNamesToSend);
        }
    });
    
    // Event for setting new sensor settings
    socket.on('newSensorSettings', (settings, callback) => {

        // console.log(JSON.parse(settings)); // Used for debugging
        let newSettings = JSON.parse(settings);
        let sensorIDs = Object.keys(newSettings);
        let settingsNotCorrect = false;

        // Check the configuration for all the sensors that there given
        sensorIDs.forEach(sensorID => {
            let sensorSettings = newSettings[sensorID];
            // sensorSettings = _.uniq(sensorSettings, 'name') // Not needed, I think...
            
            // Check all the sensor parameters
            let settingsOK = checkSensorSettings(sensorID, sensorSettings);
            if (!settingsOK) {
                // If there is any settings not correct for any of the sensors
                settingsNotCorrect = true;
            }
            // console.log(settingsOK); // Used for debugging
        });
        
        if (!settingsNotCorrect && (sensorIDs.length !== 0)) {
            // Add the new sensor configuration to the config object
            sensorIDs.forEach((sensor) => {
                sensorConfig['sensor-config'][sensor] = newSettings[sensor];
                sendNewSetpoints(newSettings[sensor]['robot']);
            })

            // uses sync db to make the writing to the DB more secure and less prone to mistakes
            writeDatabaseSync(sensorConfigPath, sensorConfig);
            socket.emit('newSensorSettings', true, callback);
        } else {
            socket.emit('newSensorSettings', false, callback);
        }
    });
    
    // Event for setting of new robot setting
    socket.on('newRobotSettings', (settings, callback) => {
        // console.log(JSON.parse(settings)); // Used for debugging
        let newSettings = JSON.parse(settings);
        let robotIDs = Object.keys(newSettings);
        let settingsNotCorrect = false;

        // Check the configuration for all the robots that where given        
        robotIDs.forEach(robotID => {
            let robotSettings = newSettings[robotID];
            // Check all the parameters for the robot
            let settingsOK = checkRobotSettings(robotID, robotSettings);
            if (!settingsOK) {
                // If there is any settings not correct for any of the sensors
                settingsNotCorrect = true;
            }
        });

        if (!settingsNotCorrect && (robotIDs.length !== 0)) {
            robotIDs.forEach((robot) => {
                // Remove duplicates before saving to the robot config
                robotConfig['robot-config'][robot] = _.uniq(newSettings[robot]);
            })

            // uses sync db to make the writing to the DB more secure and less prone to mistakes
            writeDatabaseSync(robotConfigPath, robotConfig);
            socket.emit('newRobotSettings', true, callback);
        } else {
            socket.emit('newRobotSettings', false, callback);
        }
    });
});


// If there in an connection from a robot this runs
robotNamespace.on('connect', robotFunctionality);

// This is what runs on all the connections that is NOT in the admin namespace
io.on('connection', robotFunctionality);

// Write new sensor data to the database every 60 seconds
let var1 = setInterval(addSensorsToDB, 60000);

// Start the server on port specified in the server-config
server.listen(serverPort);


/*********************************************************************
 * PROGRAM FUNCTIONS
 *********************************************************************/

/**
 * Contains all the functionality for the robots.
 * Needed to be moved to a function to be able to reuse the code for both the robot namespace and
 * the default namespace (for compatibility reasons)
 * @param socket - The socket of the robot
 */
function robotFunctionality(socket) {
    // Only robots in the robot namespace can send data to the server (or default)
    // When a client connects to the server it gets sent to the room for unsafe clients
    let clientID = socket.id;
    let client = io.sockets.connected[clientID];
    robotsConnected[clientID] = {};
    console.log("Client connected with ID: " + clientID);

    socket.on('authentication', (passcode) => {
        if (unusedPasscodes.includes(passcode)) {
            // Remove the passcode so no one else can use the same passcode
            unusedPasscodes = _.without(unusedPasscodes, passcode);
            // Add client to used passcodes with the passcode used
            robotsConnected[clientID]['passcode'] = passcode;
            // Move robot to the safe robots room, and send feedback for successful authentication
            socket.join(safeRobotRoom);
            // Send feedback to the robot
            socket.emit('authentication', true);

            //printRoomClients(safeRobotRoom); // Used to debug
        } else {
            // Send feedback to the robot that the authentication failed
            socket.emit('authentication', false);
        }
    });

    socket.on('robotID', (robotID) => {
        robotsConnected[clientID]['robotID'] = robotID;
        // Check the database for the sensors connected to the robot
        // Store the robot id together with the clientID
        sendNewSetpoints(robotID);

    })

    socket.on('sensorData', (data) => {
        // Check if the client is authenticated
        // Only log the data if the robot is authenticated and the clientId is valid and in use
        if (socket.rooms[safeRobotRoom] === safeRobotRoom && robotsConnected[clientID] !== undefined) {
            console.log("Received data from: " + clientID);
            // The data from the unit get parsed from JSON to a JS object
            let parsedData = parseFromJSON(data);
            let sensorID;
            let dataType;

            if (parsedData['ControlledItemID'] !== undefined) {
                // if the data is for the controlled item set the sensorID from that
                sensorID = parsedData['ControlledItemID'];
                dataType = 'ControlledItemID';
            } else if (parsedData['SensorID'] !== undefined) {
                // Else the data is from a sensor and the id is the sensorID
                sensorID = parsedData['SensorID'];
                dataType = 'SensorID';
            }

            // the data to add is temperature and timestamp
            let dataObject = {
                'value': parsedData.value,
                'time': Date.now(),
            };
            let sensorData = {};
            sensorData[sensorID] = dataObject;

            // Creates the sensor name object in the new sensor array if it doesn't exist, and adds the new measurement
            newSensorData[dataType][sensorID] = newSensorData[dataType][sensorID] || [];
            newSensorData[dataType][sensorID].push(dataObject);
            console.log('Data added to sensor ' + sensorID + ': ' +
                ' Datatype ' + dataType +
                ', Time ' + dataObject['time'] +
                ', Value ' + dataObject['value']);


            let newData = {}
            newData[dataType] = {};
            newData[dataType][sensorID] = dataObject;
            //Send the new sensor data to all connected webclients
            webserverNamespace.emit('newSensorValue', JSON.stringify(newData));
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('Robot:' + clientID + ' disconnected with reason: ' + reason);
        // Remove the passcode from used passcodes and add it to unused passcodes
        if (robotsConnected[clientID] !== undefined) {

            unusedPasscodes.push(robotsConnected[clientID]['passcode']);
            console.log('Passcode used by client can now be reused');
        }

        // Delete the client
        delete robotsConnected[clientID];
        socket.leave(safeRobotRoom);
        console.log('Removed all information for client: ' + clientID);
    });
}


/**
 * Function to add sensor data to the database
 */
function addSensorsToDB() {
    Object.keys(newSensorData).map((dataType) => {

        addDataToDB(databasePaths[dataType], newSensorData, dataType, (numberOfRecords) => {
            // Get how many measurements that was added to the database

            Object.keys(numberOfRecords).map((sensor, index) => {
                // Cycle thru every sensor with measurements that was added
                let numberToDelete = numberOfRecords[sensor];
                // Delete the same number of records that was added to the database (deletes from first)
                newSensorData[dataType][sensor].splice(0, numberToDelete);
                // If all the records for one sensor are added delete that sensor, so there are no empty sensor arrays
                if (Object.keys(newSensorData[dataType][sensor]).length === 0) {
                    delete newSensorData[dataType][sensor];
                }
            });
        });
    });

}


/**
 * Prints all the connected sockets in the room
 * @param roomName
 */
function printRoomClients(roomName) {
    let clients = io.of(roomName).connected;
    console.log('Clients in room ' + roomName)
    for (const socket in clients) {
        console.log('   ' + socket);
    }
}


/**
 * Function to get data from the database and form newSensorData, and returns the data as an object
 * The time interval for the search is controlled by the start time and the stop time.
 * If the stop time is 0 the search return all the sensor data from the start time to the time of the search.
 * @param startTime     start time of the search (time in ms from 01.01.1970)
 * @param stopTime      stop time for the search (time in ms from 01.01.1970)
 * @param sensorID      name of the sensor, the sensorID
 * @param dataType      Specifies the type of data to search for (e.g. SensorID or ControlledItemID)
 * @param callback      Runs the callback with the sensor data for the sensor specified
 */
function getData(startTime, stopTime, sensorID, dataType, callback) {
    // let dataType = "SensorID";
    let sensorData = [];    // Variable to store all the sensor data
    let databasePath;
    if (dataType === 'ControlledItemID') {
        databasePath = controlledItemDatabase;
    } else {
        databasePath = sensorDatabase;
    }
    // If there are no specified stop time, the stoptime is set to the time of the search
    if (stopTime === 0 || stopTime === undefined) {
        stopTime = Date.now();
    }

    // Get all the sensor data that is not in the database
    let dataFromSensorArray = newSensorData[dataType][sensorID];

    // Check if there are any sensor data in the last sensor reading
    if (dataFromSensorArray !== undefined) {
        // Get all the measurements in the correct time period
        getSensorMeasurements(dataFromSensorArray, startTime, stopTime, (measurements) => {
            sensorData = sensorData.concat(measurements);
        });
    }

    // Get all the records in the correct time interval from the database
    getDatabase(databasePath, (database) => {
        let sensorDataFromDB = database[dataType][sensorID];
        // Check if there are any sensor data for the sensor in the DB
        if (sensorDataFromDB !== undefined) {
            // Get all the measurements in the correct time period
            getSensorMeasurements(sensorDataFromDB, startTime, stopTime, (measurements) => {
                // Append the data to the array
                sensorData = sensorData.concat(measurements);
            });
        }
        // Run the callback if specified with the sensor data from BOTH the database and the new sensor data
        if (callback) callback(sensorData);

    }, error => {
        // If there is an error accessing the database, print an error message
        console.log("There was an error accessing the database");
        // Run the callback if specified with only the data NOT in the database
        if (callback) callback(sensorData);
    });

}

/**
 * Function to filter the measurement data, and only return the data witch is in the correct time period
 * @param placeToCheck
 * @param startTime
 * @param stopTime
 * @param callback
 */
function getSensorMeasurements(placeToCheck, startTime, stopTime, callback) {
    let correctData = [];
    // Check if the time of the reading are inline with the time requirements
    Object.keys(placeToCheck).map((data, index) => {

        // Check if the time of measurement is in the interval between startTime and stopTime
        if (placeToCheck[index].time >= startTime && placeToCheck[index].time <= stopTime) {
            // Add measurement to the sensorData
            correctData.push(placeToCheck[index]);
        }
    })

    if (callback) callback(correctData);
}


/**
 * Function that retrieves a JSON database from a file path.
 * This is an asynchronous function, and executes the callback after loading and parsing the database.
 * @param pathToDb
 * @param callback
 * @param error     Runs if there is an error on reading the database
 */
function getDatabase(pathToDb, callback, error) {
    // Read the database and parse it from JSON format to JS object.
    fs.readFile(pathToDb, (err, dataBuffer) => {
        if (err) throw err;
        try {
            // Parse the JSON database to a JS object
            const database = JSON.parse(dataBuffer);

            //Run callback if it is defined
            if (callback) {
                callback(database);
            } else {
                // Return the database if there is no callback
                return database
            }
        } catch (SyntaxError) {
            //Run error code if there is a SyntaxError in the DB. E.g. DB is not in JSON format
            console.error('Error loading database. No changes has been made to the file.');
            if (error) error();
        }
    });
}


/**
 * Function that retrieves a JSON database from a file path.
 * This is an synchronous function, and returns the database as a JS object.
 * @param pathToDb  Path to the database
 * @param error     Runs if there is an error on reading the database
 * @return databse  Returned as a JS object
 */
function getDatabaseSync(pathToDb, error) {
    // Read the database and parse it from JSON format to JS object.
    try {
        let database = fs.readFileSync(pathToDb);
        // Parse the JSON database to a JS object
        return JSON.parse(database);

    } catch (SyntaxError) {
        //Run error code if there is a SyntaxError in the DB. E.g. DB is not in JSON format
        console.error('Error loading database. No changes has been made to the file.');
        if (error) error();
    }
}

/**
 * Function that retrieves a JSON database from a file path.
 * This is an synchronous function, and returns the database as a JS object.
 * @param pathToDb  Path to the database
 * @param dataToWrite
 * @return databse  Returned as a JS object
 */
function writeDatabaseSync(pathToDb, dataToWrite, error) {
    //  Write to the database path as a JSON file.
    try {
        //  Write to the database path as a JSON file.
        fs.writeFileSync(pathToDb, JSON.stringify(dataToWrite, null, 2));
    } catch (e) {
        //Run error if there was a problem writing to the DB
        console.error('Error writing database.');
        if (error) error();
    }
}


/**
 * Function that first reads the database stored on the supplied path and add the data supplied to the database.
 * The function assumes there is only one type of data that is going to be added to the database.
 * You need to delete the data after it is added to the database, the callback function can be used for this.
 * @param databasePath
 * @param newData    Object contains all the sensor data the first object is the same as the parent object in the database.
 * @param dataType   The type of data that is going to be added
 * @param callback   The callback function supplies the number of records that is deleted
 */
function addDataToDB(databasePath, newData, dataType, callback) {

    // Variable to store the sensor name and how many records to delete after import to the database
    let deletedRecords = {};

    // First object is always the dataID, e.g. SensorID
    //let dataType = Object.keys(newData)[0];

    // Read the newest version of the database.
    getDatabase(databasePath, (database) => {
        // Merge the new data one sensor at the time
        Object.keys(newData[dataType]).map((sensor) => {
            deletedRecords[sensor] = 0;

            //Create the data type in the database if it is not there
            database[dataType] = database[dataType] || {};
            console.log('Adding data form sensor: ' + sensor);

            // Create the sensor name in the database if it is not there
            database[dataType][sensor] = database[dataType][sensor] || [];

            // Add every measurement to the database
            newData[dataType][sensor].forEach((measurement) => {
                database[dataType][sensor].push(measurement);

                // Count how many records that is added
                deletedRecords[sensor]++;
            });
        });

        //Convert the new database to JSON
        const jsonDatabase = JSON.stringify(database, null, 2);
        // Write the new database to the path
        fs.writeFile(databasePath, jsonDatabase, (err) => {
            if (err) throw err;
            console.log('Data written to file: ' + databasePath);
        });

        // Callback after the database has been updated, if it is in use
        if (callback) callback(deletedRecords);
    });
}


/**
 * Function to parse data from JSON to a JS object.
 * If it occurs an error the object returned is the same as the object given
 * @param dataToParse - The object to parse
 * @return {*}
 */
function parseFromJSON(dataToParse) {
    let data = dataToParse;
    // Try to parse the data from JSON,
    try {
        data = JSON.parse(dataToParse);
    } finally {
        return data;
    }
}


/**
 * Function to check if the parameters for the robot settings. 
 * Check if all the parameters are valid. 
 * In if the robotId is valid. If everything is valid it return true.
 * @param robot - The robotID to check
 * @param sensors - The array containing all the sensors to check
 * @return {boolean}
 */
function checkRobotSettings(robot, sensors) {
    let regexForID = new RegExp('^[a-zA-Z0-9#]+$'); // Ids can only contain letters and numbers (and #)
    // Status flags
    let robotOK = false;
    let sensorsOK = true;

    // Check the robotID
    if (regexForID.test(robot)) robotOK = true;
    // Check all the sensors, if one is wrong return false
    sensors.forEach(sensor => {
        if (!regexForID.test(sensor)) sensorsOK = false;
    });
    
    return robotOK && sensorsOK;
}


/**
 * Function to check if the parameters for the sensor settings.
 * Check if all the parameters are valid.
 * If everything is valid it return true.
 * @param sensorID
 * @param settings
 * @return {boolean}
 */
function checkSensorSettings(sensorID, settings) {
    // Definitions for all the parameters as RegExp
    let regexControlType = new RegExp('^reverse$|^direct$|^none$'); // Valid control types are: direct, reverse, none
    let regexSensorType = new RegExp('^temperature$|^co2$'); // Valid types are: temperature, co2
    let regexForID = new RegExp('^[a-zA-Z0-9#]+$'); // Ids can only contain letters and numbers (and #)
    let regexSetpoint = new RegExp('^[0-9]+[.][0-9]+$|^[0-9]+$');
    let regexControlledItem = new RegExp('^false$|^true$');
    
    // Status flags
    let sensorIdOK = false;
    let controlTypeOK = false;
    let robotIdOK = false;
    let sensorTypeOK = false;
    let setpointOK = false;
    let controlledItemOK = false;

    // Check the SensorID
    if (regexForID.test(sensorID)) {
        sensorIdOK = true;
        // console.log('sensor ok')
    }
    // Check the control type
    if (regexControlType.test(settings['controlType'])) {
        // console.log('fdsfsd')
        controlTypeOK = true;
        // console.log('control type ok')
    }
    // Check the sensor type (co2/temp)
    if (regexSensorType.test(settings['type'])) {
        sensorTypeOK = true;
        // console.log('type ok')
    }
    // Check the robotID for the sensor
    if (regexForID.test(settings['robot'])) {
        robotIdOK = true;
        // console.log('robot ok')
    }
    // Check the controlled item is correctly defined (true/false)
    if (regexControlledItem.test(settings['controlledItem'])) {
        controlledItemOK = true;
        // console.log('controlled item ok')

    }
    // Check the SensorID
    if (settings['setpoint']) {
        if (regexSetpoint.test(settings['setpoint'])) {
            setpointOK = true;
            // console.log('setpoint ok')
        }
    } else {
        // If there is no setpoint it is automatically ok
        setpointOK = true;
        // console.log('no setpoint ok')
    }
    return (sensorIdOK && controlTypeOK && sensorTypeOK && robotIdOK && setpointOK && controlledItemOK);
}

/**
 * Function for sending of new setpoints to the robot specified.
 * Only sends the setpoints if the robot is connected.
 * @param robotID - The robotID for the robot
 */
function sendNewSetpoints(robotID) {

    let sensorConnected = robotConfig['robot-config'][robotID];
    let robotClient = "none";
    // Get the client id for the socket used by the robot
    Object.keys(robotsConnected).map((client) => {
        if (robotsConnected[client]["robotID"] === robotID) {
            robotClient = client;
        }
    });
    // Check if the robot is connected
    if (robotClient !== "none") {
        let socket = io.sockets.sockets[robotClient];
        let setpointsToSend = {};

        try {
            // Retrieve all the setpoints for the sensors connected to the sensor
            sensorConnected.forEach(sensor => {
                console.log(sensor);
                if (sensorConfig['sensor-config'][sensor]['controlledItem'] === true) {
                    setpointsToSend[sensor] = sensorConfig['sensor-config'][sensor].setpoint;
                } else {
                    setpointsToSend[sensor] = "none";
                }
            })
        } catch (TypeError) {
            setpointsToSend = {}
            console.log('There is no setpoints for this robot!')
        }
        // Send the setpoints as a JSON object to the robot
        socket.emit('setpoints', JSON.stringify(setpointsToSend));
    }
}