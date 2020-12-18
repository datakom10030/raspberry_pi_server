# Raspberry Pi Server

This is only a prototype, and should __NOT__ be used for any critical work.

This is the server application made for Raspberry Pi to receive communication from an ESP-32 robot and webclients. The
application can authenticate the robots connected by a passcode. The server sends new setpoints for the robots (if
implemented in the robot). Sensor data received from the robots are stored in databases for storage, and webclients can
request the data. The webclient can send new configurations for sensors and robots. The configurations are also stored
in databases. Any new configurations from webclients are verified before they are stored and sent to robots. If the
configuration fails the verification they are deleted, and a message is sent to the webclient.

## Table of Contents

1. [Installation](#Installation)
2. [Usage](#Usage)
    1. [Authentication and security](#authentication-and-security)
    2. [Database](#database)
        1. [Storing of the sensor data](#storing-of-the-sensor-data)
        2. [Configuration of sensors/robots](#configuration-of-sensorsrobots)
3. [Protocol for communication between the robot and server](#protocol-for-communication-between-the-robot-and-server)
    1. [authentication [server/robot]](#authentication-serverrobot)
    2. [unitID [server]](#unitid-server)
    3. [setpoint [robot]](#setpoint-robot)
    4. [sensorData [server]](#sensordata-server)
4. [Protocol for communication between webclients and the server](#protocol-for-communication-between-webclients-and-the-server)
    1. [getData [server]](#getdata-server)
    2. [dataResponse [webclient]](#dataresponse-webclient)
    3. [allSensors [server/webclient]](#allsensors-serverwebclient)
    4. [allRobots [server/webclient]](#allrobots-serverwebclient)
    5. [sensorInfo [server/webclient]](#sensorinfo-serverwebclient)
    6. [robotInfo [server/webclient]](#robotinfo-serverwebclient)
    7. [newSensorSettings [server/webclient]](#newsensorsettings-serverwebclient)
    8. [newRobotSettings [server/webclient]](#newrobotsettings-serverwebclient)
5. [Contributing](#contributing)
6. [Branches](#branches)
7. [License](#license)

## Installation

Describe the installation process for the program.

````shell
git clone https://github.com/datakom10030/raspberry_pi_server.git
npm install webserver
````

## Usage

This program is made to be used in conjunction with the [robot program](https://github.com/datakom10030/ESP32Client),
and the [webserver/websites](https://github.com/datakom10030/webserver)

There is one [main program](src/index.js) and one [robot client](src/JSClient.js) that can be used to simulate or test
the main program.

### Authentication and security

Every robot that connects to the server needs to use a passcode to be authenticated. All the passcode needs to be
predefined and added to main program. This can be done by adding randomly generated passcodes. See example below (please
don't use these codes):

```JavaScript
let unusedPasscodes = ["123456789", "123456788"];   
```

This means the first communication from a robot (ESP-32) to the server has to be the 'passcode'. Or else the server will
block (blacklist) the communication from that ip. If the passcode is not used for a certain time period it needs to be
deleted. E.g. if the passcode has not been used for 1 week the passcode is deleted, and the user needs to generate a new
one from the webpage if the unit is going to be used again later.

This is only for communication from a robot to the server.

### Database

This server implements four databases. Two of these are for storing of historical data received from the robots, and the
other two are for storing configurations for the sensors and robots.

#### Storing of the sensor data

The sensor data should be stored in a local .json file. The structure of the database is a hierarchy were the top-level
is sensorID or ControlledItemID. Every unique sensorID has an entry under sensorID, that stores all the sensor data.
Every data entry contains the value of the sensor and a timestamp. See example below for the database setup.

```JSON
{
  "SensorID": {
    "#####1": [
      {
        "value": 25.2,
        "time": 3214214
      },
      {
        "value": 25.2,
        "time": 3214214
      }
    ]
  }
}
```

This is an example for storing of the sensor data. for the controlled item the structure is the same,
but  ```"SensorID"``` is replaced by ```"ControlledItemID"```.

#### Configuration of sensors/robots

The sensor-config.json in the config directory is the setup file for the sensors, and contains all the configuration for
the sensors and what the sensors control. An example of the structure is shown below.

```JSON
{
  "sensor-config": {
    "uniqueSensorID": {
      "robot": "unit1",
      "type": "temperature",
      "controlType": "direct",
      "output": true,
      "setpoint": 23.0
    },
    "uniqueSensorID2": {
      "robot": "unit1",
      "type": "co2",
      "controlType": "reversed",
      "output": true,
      "setpoint": 23.0
    }
  }
}
```

The robot-config.json in the config directory is the setup file for the robots, and contains information on what sensors
that is connected to the robot. An example of the structure is shown below.

```JSON
{
  "robot-config": {
    "unit1": [
      "#####1",
      "#####2",
      "#####3",
      "#####4"
    ],
    "unit2": [
      "#####5",
      "#####6"
    ]
  }
}
```

## Protocol for communication between the robot and server

The communication between a unit (ESP-32) and the main server are
using [socket.io](https://github.com/socketio/socket.io). The following events can be used by the robot client:

- authentication
- unitID
- sensorData

The events sent from the server:

- authentication
- setpoint

Some of these command are required, and some are merely a suggestion for easier implementation.

This is a brief description of the communication protocol used between units and the robot server.

____
The events are sorted by the recommended flow.

Recipient for the event is in the square bracket - e.g. [server] is a message from the robot to the server.

Parenthesis are used as a descriptor for the datatype - e.g. foo (bool), means that _foo_ is a bool variable.
____

### authentication [server/robot]

If a robot is not authenticated the server will ignore all other messages from the robot!
The first message from the robot should therefore be the passcode in the following format:

```
'authentication', passcode(str)
```

The robot will receive the following message as replay if the passcode is correct:

```
'authentication', true(bool)
```

And if the passcode is wrong:

```
'authentication', false(bool)
```

These responses can be used as a verification, or as a listening event for triggering the next message. E.g., can be
used to trigger the unitID event.

### unitID [server]

After the unit has been authenticated it needs to send the unitID in the following format:

```
'robotID', "####1"
```

The robotID do not _have_ to be unique. There may occur some problems if it is not, and it is therefore strongly
recommended. When the webserver has received and verified the robotID it will reply with the setpoints as described in
the next event.

### setpoint [robot]

For receiving the setpoints the server need to know the robotID, so that event has to be done beforehand. This event is
sent after the unitID have been received for first time setup. It will also be sent if a webclient reconfigure a sensor
(e.g. sets a new setpoint for a server). Setpoints for all the sensors are sent every time. The server sends the
setpoint to the unit in the following format:

```
"setpoint", setpointMessage
```

Setpoint is the event, and the setpointMessage is a string in JSON format, with one line per sensors, like this:

```JSON
{
  "uniqueSensorID": 25.3,
  "uniqueSensorID2": 500
}
```

Where uniqeSensorID is replaced by the sensorID of the first sensor for the unit, and 25.3 is replaced by the value of
the setpoint for that sensor. E.g. if the configuration of the unit has only one sensor, the ID of this sensor
is ```#####1```, and the setpoint is 23.5 degrees the JSON message would be as follows with the event tag setpoint:

```JSON
{
  "#####1": 23.5
}
```

If one of the sensors defined in the robot-config are only used for monitoring (i.e. controlledItem is set to false in
the sensor-config)
the setpoint is set to none like this:

```JSON
{
  "#####1": "none"
}
```

This will be a text string and can therefore cause problem if it is not implemented correctly. We recommend to check if
the received setpoint is a valid number, and if it isn't then ether ignore it (i.e. overwrite the setpoint with a
predefined value) or use it to disable the control loop on the robot. If the last option is selected the webclients will
have the ability to disable the control loop.

### sensorData [server]

When the unit has received the setpoints it can start transmitting sensor data to the server in the following format:

```
    'sensorData', sensorData
```

Where sensorData is formatted in JSON and need to include the unitID as a number between 000 and 999, sensorID as a
number between 000 and 999 and temperature as a number between -50 and 250 (degrees celsius). It is possible to send
larger values, but the system is not designed for this. See the example below.

```JSON
{
  "SensorID": "####1",
  "value": 25.3
}
```

If the sensor data is for a controlled item, e.g. heating panel or valve for air damper, you use the same event (
SensorData), and the structure of the sensorData is as follows:

```JSON
{
  "ControlledItemID": "####1",
  "value": true
}
```

Where the ControlledItemID is the same as the ID for the sensor used to control the output. The value can be a binary
value (true/false), or a number (0-100). Note: There may be some webclients that only has support for a binary
representation (e.g. true/false or 1/0).

## Protocol for communication between webclients and the server

The communication between webclients and the main server are using [socket.io](https://github.com/socketio/socket.io).

The following events can be used by the webclient:

- getData
- sensorInfo
- robotInfo
- allSensors
- allRobots
- newSensorSettings
- newRobotSettings

The following events are sent from the server:

- dataResponse
- sensorInfo
- robotInfo
- allSensors
- allRobots
- newSensorSettings
- newRobotSettings
- newSensorValue (see dataResponse)

Some of these command are required, and some are merely a suggestion for easier implementation and expanded
functionality.

____
The events are sorted by the recommended flow.

Recipient for the event is in the square bracket - e.g. [server] is a message from the webclient to the server.

Parenthesis are used as a descriptor for the datatype - e.g. foo (bool), means that _foo_ is a bool variable.
____

### getData [server]

There needs to be a place to show what sensors the user has access to. The table/graph needs to be generated from a user
selection of sensors and timeperiod.

The communication between the client and the robot server to get sensor data is in the following format:

```
"getData", sensorSettings
```

Where getData is the event and sensorSettings is a JSON object formatted as a string. The sensorSettings can contain the
the following settings:

- startTime: the start time in ms
- stopTime: the stop time in ms (set to 0 to get all records from start time to now)
- sensorID: the ID of the sensor or controlled item
- dataType: What to get data from (e.g. SensorID or ControlledItemID), default is SensorID

An example for the sensorSettings can be as follows:

```JSON
{
  "startTime": 1604669200206,
  "stopTime": 1704669200206,
  "sensorID": "#####1",
  "dataType": "SensorID"
}
```

The server will respond with the dataResponse event explained in the next part.

### dataResponse [webclient]

The response from the server for the event getData, is in the following format:

```
"dataResponse", sensorData
```

Where sensorData is structured in the same way as the database, and is an JSON object. Depending on if the data is for a
SensorID or ControlledItemID the data is stored under a tag of the same name. All the sensor data is stored in an array
with the sensorID/controlledItemID of the sensor as the tag. An example of this is shown below where #####1 is the
sensorID, and the data is for a sensor:

```JSON
{
  "SensorID": {
    "#####1": [
      {
        "value": 21.16,
        "time": 1607689837038
      },
      {
        "value": 20.05,
        "time": 1607689861114
      },
      {
        "value": 22.11,
        "time": 1607689873144
      }
    ]
  }
}
```

This example is only to show the structure, the message that is sent is more compact (without all linebreaks and spaces)
. Note: If the data is for a controlled item "SensorID" is replaced by "ControlledItemID".

### allSensors [server/webclient]

This event can be used to retrieve all the sensorIDs that are stored in the sensor-config. This means that all sensors
needs to be in the sensor-config, even if they are only used for monitoring. The event is structured as follows:

```
"allSensors", true(bool)
```

It is important to include the true variable, as this is used for a validation for that the correct protocol is
followed. The response from the server will use the same event and is structured like this:

```
"allSensors", sensorIDs
```

Where sensorIDs is an JSON object containing an array of all the sensorIDs an example of this is:

```JSON
[
  "#####1",
  "#####2",
  "#####3",
  "#####4"
]
```

### allRobots [server/webclient]

This event can be used to retrieve all the robotIDs that are stored in the robot-config. This means that all robots
needs to be in the robot-config. The event is structured as follows:

```
"allRobots", true(bool)
```

It is important to include the true variable, as this is used for a validation for that the correct protocol is
followed. The response from the server will use the same event and is structured like this:

```
"allRobots", robotIDs
```

Where sensorIDs is an JSON object containing an array of all the sensorIDs an example of this is:

```JSON
[
  "unit1",
  "unit2"
]
```

### sensorInfo [server/webclient]

This event can be used by webclients to retrieve the configuration for a single sensor. The following format need to be
used:

```
"sensorInfo", sensorID(str), callback
```

The sensorID for the sensor should be sent as a string. The response from the server will be:

```
"sensorInfo", sensorConfig, callback
```

Where the callback is exactly the same as the callback that was sent by the webclient. This can be used if there is a
need for passing a function that are to be executed when the reply from the server is received. The sensorConfig object
is in the same JSON format as the sensor-config database. An example of this is:

```JSON
{
  "#####1": {
    "robot": "unit1",
    "type": "temperature",
    "controlType": "reverse",
    "controlledItem": true,
    "setpoint": "25"
  }
}
```

### robotInfo [server/webclient]

This event can be used by webclients to retrieve the configuration for a single robot (i.e. get all the sensors
connected to a robot). The following format are to be used:

```
"robotInfo", robotID(str), callback
```

The robotID for the sensor should be sent as a string. The response from the server will be:

```
"robotInfo", robotConfig, callback
```

Where the callback is exactly the same as the callback that was sent by the webclient. This can be used if there is a
need for passing a function that are to be executed when the reply from the server is received. The robotConfig object
is in the same JSON format as the sensor-config database. An example of this is:

```JSON
{
  "unit1": [
    "#####1",
    "#####2",
    "#####3",
    "#####4"
  ]
}
```

### newSensorSettings [server/webclient]

This is an event that can be used by webclients to add a new configuration for a sensor or set new parameters to an
existing one.

Proceed with caution the new parameters will _overwrite_ any existing parameters for the sensor!

The event is structured as follows:

```
"newSensorSettings", sensorSettings
```

Where sensorSetting is an JSON object in the same format as the reply from the server for
the [sensorInfo](#sensorinfo-serverwebclient) event, it is possible to append multiple configurations in the same
object. Here is an example of the structure with multiple sensors:

```JSON
{
  "#####1": {
    "robot": "unit1",
    "type": "temperature",
    "controlType": "reverse",
    "controlledItem": true,
    "setpoint": "25"
  },
  "#####2": {
    "robot": "unit3",
    "type": "co2",
    "controlType": "direct",
    "controlledItem": true,
    "setpoint": "25"
  }
}
```

If the configuration is successfully validated by the server, and successfully added to the database the server responds
with:

```
"newSensorSettings", true (bool)
```

And if there was a problem in the configuration the server respond with:

```
"newSensorSettings", false (bool)
```

There are no changes made to the configuration if this is the reply.

### newRobotSettings [server/webclient]

This is an event that can be used by webclients to add a new configuration for a robot or set new parameters to an
exiting one

Proceed with caution the new parameters will _overwrite_ any existing parameters for the robot!

The event is structured as follows:

```
"newRobotSettings", robotSettings
```

Where sensorSetting is an JSON object in the same format as the reply from the server for
the [robotInfo](#robotinfo-serverwebclient) event. It is possible to append multiple configurations in the same object.
Here is an example of the structure with multiple robots:

```JSON
{
  "unit1": [
    "#####1",
    "#####2",
    "#####3",
    "#####4"
  ],
  "unit2": [
    "#####5",
    "#####6",
    "#####7",
    "#####8"
  ]
}
```

If the configuration is successfully validated by the server, and successfully added to the database the server responds
with:

```
"newSensorSettings", true (bool)
```

And if there was a problem in the configuration the server respond with:

```
"newSensorSettings", false (bool)
```

There are no changes made to the configuration if this is the reply.

## Contributing

If you want to contribute to this project you need to use the same structure and guidelines followed by this project.

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

Please make sure to update tests as appropriate.

## Branches

wip - Works in progress; stuff I know won't be finished soon

bug - Bug fix or experiment

## License

[MIT](https://choosealicense.com/licenses/mit/)
