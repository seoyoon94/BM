#!/usr/bin/env node
const record = require('node-record-lpcm16')
const fs = require('fs')
const uuid = require('uuid/v1')
const Speech = require('@google-cloud/speech')
const TextToSpeech = require('@google-cloud/text-to-speech')
const DialogFlow = require('dialogflow')

const projectId = 'blabber-1535687025249'

const client = new Speech.SpeechClient()

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

function dialogflowRequestFrom (sessionPath, query) {
    return {
        session: sessionPath,
        queryInput: {
            text: {
                text: query,
                languageCode: 'en-US'
            }    
        }
    }
}

function textToSpeechRequest (text) {
    return {
        input: {
            text
        },
        // Select the language and SSML Voice Gender (optional)
        voice: {
            languageCode: 'en-US',
            ssmlGender: 'NEUTRAL'
        },
        // Select the type of audio encoding
        audioConfig: {
            audioEncoding: 'MP3'
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
    
    const sessionClient = new DialogFlow.SessionsClient();
    const sessionPath = sessionClient.sessionPath(projectId, uuid());
    const request = dialogflowRequestFrom(sessionPath, data.results[0].alternatives[0].transcript)

    sessionClient
        .detectIntent(request)
        .then(responses => {
            console.log('Detected intent');
            const result = responses[0].queryResult;
            console.log(`  Query: ${result.queryText}`);
            console.log(`  Response: ${result.fulfillmentText}`);

            const client = new TextToSpeech.TextToSpeechClient();
            // Performs the Text-to-Speech request
            client.synthesizeSpeech(textToSpeechRequest(result.fulfillmentText), (err, response) => {
                if (err) {
                    console.error('ERROR (TTS):', err)
                    return
                }
            
                // Write the binary audio content to a local file
                fs.writeFile('response.mp3', response.audioContent, 'binary', err => {
                    if (err) {
                        console.error('ERROR (Node FS):', err)
                        return
                    }
                    console.log('Audio content written to file: response.mp3')
                })
            })
  
            if (result.intent) {
                console.log(`  Intent: ${result.intent.displayName}`);
            } else {
                console.log(`  No intent matched.`);
            }
        })
        .catch(err => {
            console.error('ERROR (Dialogflow):', err);
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
