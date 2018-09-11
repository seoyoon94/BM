#!/usr/bin/env node
const record = require('node-record-lpcm16')
const fs = require('fs')
const uuid = require('uuid/v1')
const Speech = require('@google-cloud/speech')
const TextToSpeech = require('@google-cloud/text-to-speech')
const DialogFlow = require('dialogflow')

let responseCounter = 1

/**
 * Dialogflow Project ID
 */
const dialogflowProjectId = 'blabber-1535687025249'

/**
 * Instantiate client libraries.
 */
const speechToTextClient = new Speech.SpeechClient()
const dialogflowClient = new DialogFlow.SessionsClient()
const textToSpeechClient = new TextToSpeech.TextToSpeechClient()

const sessionPath = dialogflowClient.sessionPath(dialogflowProjectId, uuid());

/**
 * Creates a request for the node voice record library
 * with static values.
 * @returns {object} Request for node voice recording.
 */
function createVoiceRecordRequest () {
    return {
        config: {
          encoding: 'LINEAR16',
          sampleRateHertz: 16000,
          languageCode: 'en-US',
        },
        interimResults: false,
      }
}

/**
 * Creates a request for Dialogflow for a given session
 * with user input.
 * @param {string} sessionPath Session path for the Dialogflow request.
 * @param {string} query User input query.
 * @returns {object} Dialogflow client request.
 */
function dialogflowRequest (query) {
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

/**
 * Creates a request for the text to speech client.
 * @param {string} text Text to be translated into a voice output.
 * @returns {object} Static request for the text to speech client.
 */
function textToSpeechRequest (text) {
    return {
        input: {
            text
        },
        voice: {
            languageCode: 'en-US',
            ssmlGender: 'NEUTRAL'
        },
        audioConfig: {
            audioEncoding: 'MP3'
        }
    }
}

/**
 * Transforms raw audio content into a usable MP3 file.
 * @param {Error} err Node error object.
 * @param {object} response Response containing audio content
 *      parsed from a text input.
 * @returns {undefined} No output.
 */
function processTtsResponse (err, response) {
    if (err) {
        console.error('ERROR (TTS):', err)
        return
    }

    // Write the binary audio content to a local file
    fs.writeFile(`response-${responseCounter}.mp3`, response.audioContent, 'binary', err => {
        if (err) {
            console.error('ERROR (Node FS):', err)
            return
        }
        console.log(`Audio content written to file: response-${responseCounter}.mp3`)
        responseCounter++
    })
}

/**
 * Given responses from the Dialogflow client library,
 * parse the responses for a valid output.
 * @param {array} responses Array of responses from Dialogflow.
 * @returns {undefined} No output.
 */
function processDialogflowResponses (responses) {
    console.log('Detected intent');
    const result = responses[0].queryResult;
    console.log(`  Query: ${result.queryText}`);
    console.log(`  Response: ${result.fulfillmentText}`);

    const ttsRequest = textToSpeechRequest(result.fulfillmentText)
    textToSpeechClient.synthesizeSpeech(ttsRequest, processTtsResponse)

    result.intent
        ? console.log(`  Intent: ${result.intent.displayName}`)
        : console.log(`  No intent matched.`)
}

/**
 * Takes data from the node recorder and generates an MP3
 * response to user input.
 * @param {object} data Raw data from the node recorder.
 * @returns {undefined} No output.
 */
function generateResponse (data) {
    if (!data.results[0] || !data.results[0].alternatives[0]) {
        console.log(`\n\nReached transcription time limit, press Ctrl+C\n`)
        return
    }

    const transcribedInput = data.results[0].alternatives[0].transcript
    console.log(`Transcription: ${transcribedInput}\n`)

    const request = dialogflowRequest(transcribedInput)
    dialogflowClient
        .detectIntent(request)
        .then(processDialogflowResponses)
        .catch(err => {
            console.error('ERROR (Dialogflow):', err);
        });
}

/**
 * Initializes the node voice recorder instance and
 * returns the instance.
 * @returns {object} Initialized voice recorder.
 */
function initializeSpeechToTextClient () {
    return speechToTextClient
        .streamingRecognize(createVoiceRecordRequest())
        .on('error', console.error)
        .on('data', generateResponse)
}

/**
 * Main function to be executed.
 */
function main () {
    // Create a recognize stream
    const recognizeStream = initializeSpeechToTextClient()

    // Start recording and send the microphone input to the Speech API
    record
        .start({
            sampleRateHertz: 16000,
            threshold: 0,
            // Other options, see https://www.npmjs.com/package/node-record-lpcm16#options
            verbose: false,
            recordProgram: 'rec', // Try also "arecord" or "sox"
            silence: '1.0',
        })
        .on('error', console.error)
        .pipe(recognizeStream);

    console.log('Listening, press Ctrl+C to stop.');
}

main()