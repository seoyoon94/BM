#!/usr/bin/env node
const record = require('node-record-lpcm16');
const Speech = require('@google-cloud/speech');
const DialogFlow = require('dialogflow');
const credentials = require('./dialogflow-crendentials')

const client = new Speech.SpeechClient();

const sessionClient = new DialogFlow.SessionsClient();
const sessionPath = sessionClient.sessionPath(credentials.projectId, credentials.sessionId);

function recordRequest () {
    return {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
        },
        interimResults: false,
      }
}

function dialogflowRequestFrom (query) {
    return {
        session: sessionPath,
        text: {
            text: query,
            languageCode: 'en-US'
        }
    }
}

// Create a recognize stream
const recognizeStream = client
  .streamingRecognize(recordRequest())
  .on('error', console.error)
  .on('data', data => {
    process.stdout.write(
        data.results[0] && data.results[0].alternatives[0]
          ? `Transcription: ${data.results[0].alternatives[0].transcript}\n`
          : `\n\nReached transcription time limit, press Ctrl+C\n`
    )

    sessionClient
        .detectIntent(dialogflowRequestFrom(data.results[0].alternatives[0].transcript))
        .then(responses => {
        console.log('Detected intent');
        const result = responses[0].queryResult;
        console.log(`  Query: ${result.queryText}`);
        console.log(`  Response: ${result.fulfillmentText}`);
        if (result.intent) {
            console.log(`  Intent: ${result.intent.displayName}`);
        } else {
            console.log(`  No intent matched.`);
        }
        })
        .catch(err => {
        console.error('ERROR:', err);
        });
    }
  );

// Start recording and send the microphone input to the Speech API
record
  .start({
    sampleRateHertz: 16000,
    threshold: 0,
    // Other options, see https://www.npmjs.com/package/node-record-lpcm16#options
    verbose: false,
    recordProgram: 'rec', // Try also "arecord" or "sox"
    silence: '10.0',
  })
  .on('error', console.error)
  .pipe(recognizeStream);


console.log('Listening, press Ctrl+C to stop.');
