// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

const { ActivityHandler, MessageFactory } = require('botbuilder');

const { QnAMaker } = require('botbuilder-ai');
const DentistScheduler = require('./dentistscheduler');
const IntentRecognizer = require("./intentrecognizer")

class DentaBot extends ActivityHandler {
    constructor(configuration, qnaOptions) {
        // call the parent constructor
        super();
        if (!configuration) throw new Error('[QnaMakerBot]: Missing parameter. configuration is required');

        // create a QnAMaker connector
        this.qnaMaker = new QnAMaker(configuration.QnAConfiguration, qnaOptions);
       
        // create a DentistScheduler connector
        this.DentistScheduler = new DentistScheduler(configuration.SchedulerConfiguration);
        // create a IntentRecognizer connector
        this.IntentRecognizer = new IntentRecognizer(configuration.LuisConfiguration);

        let timeRequested = '';
        let locationRequested = '';


        this.onMessage(async (context, next) => {
            // send user input to QnA Maker and collect the response in a variable
            // don't forget to use the 'await' keyword
            // Send user input to QnA Maker
            const qnaResults = await this.qnaMaker.getAnswers(context);

            // send user input to IntentRecognizer and collect the response in a variable
            // don't forget 'await'
            const LuisResult = await this.IntentRecognizer.executeLuisQuery(context);

            // determine which service to respond with based on the results from LUIS //
            if (LuisResult.luisResult.prediction.topIntent === 'GetAvailability' &&
                LuisResult.intents.GetAvailability.score > .7){

                    let locationResponse = ''

                    if (LuisResult.entities.$instance && 
                        LuisResult.entities.$instance.location &&
                        LuisResult.entities.$instance.location[0]){

                        locationRequested = LuisResult.entities.$instance.location[0].text;  
                        locationResponse = `\nat requested location: ${locationRequested}`;                        
                    }

                    let availableTimeSlots = await this.DentistScheduler.getAvailability();
                    await context.sendActivity(`${availableTimeSlots} ${locationResponse}\n. Please specify am or pm in your appointment scheduling request.`)

                    await next();
                    return;

            }
            if (LuisResult.luisResult.prediction.topIntent === 'ScheduleAppointment' &&
                LuisResult.intents.ScheduleAppointment.score > .5){

                    let locationResponse = ''

                    if (LuisResult.entities.$instance && 
                        LuisResult.entities.$instance.location &&
                        LuisResult.entities.$instance.location[0] || locationRequested !== ''){

                        locationRequested = locationRequested == ''? LuisResult.entities.$instance.location[0].text : locationRequested;  
                        locationResponse = `\nat requested location: ${locationRequested}`;                        
                    }

                    if (LuisResult.entities.$instance && 
                        LuisResult.entities.$instance.time &&
                        LuisResult.entities.$instance.time[0]){
                        timeRequested = LuisResult.entities.$instance.time[0].text;
                        const appointmentMade = await this.DentistScheduler.scheduleAppointment(timeRequested);
                        await context.sendActivity(`${appointmentMade}${locationResponse}.`)
                    }
                    else{
                        // If no appointments time mentioned before.
                        await context.sendActivity("Please mention time to book an appointment.\nSpecify am or pm.");
                    }   
                    
                    await next();
                    return;
            }
            if (LuisResult.luisResult.prediction.topIntent === 'DeleteScheduledAppointment' &&
                LuisResult.intents.DeleteScheduledAppointment.score > .5 ){

                    let locationResponse = ''

                    if(timeRequested !== ''){
                        const deletedAppointment = await this.DentistScheduler.deleteScheduleAppointment(timeRequested);
                        timeRequested = '';
                        if (locationRequested !== '')
                        {
                            locationResponse = `in ${locationRequested}`;  
                            locationRequested = '';   
                        }
                        await context.sendActivity(`${deletedAppointment} ${locationResponse}.`);                        
                    }
                    else{
                        // If no appointments scheduled before.
                        await context.sendActivity("You do not have an appointment scheduled.");
                    }   
                    await next();
                    return;                                     
            }
            


            // If an answer was received from QnA Maker, send the answer back to the user.
            if (qnaResults[0]) {
                console.log(qnaResults[0]);
                await context.sendActivity(`${qnaResults[0].answer}`);
            }
            else {
                // If no answers were returned from QnA Maker, reply with help.
                await context.sendActivity("I'm not sure I found an answer to your question."
                + ' You can ask me questions about treatment and insurance like "What if I do not have insurance?"'
                + ' \nOR\n'
                + ' You can ask me information about available appointments like "Show appointment availability at Chicago"'
                + ' You can ask me to schedule and delete an appoinment like "Schedule 8am at Chicago", "Delete/Cancel"');
             }
          
            
                     
            

            // if(top intent is intentA and confidence greater than 50){
            //  doSomething();
            //  await context.sendActivity();
            //  await next();
            //  return;
            // }
            // else {...}
             
            await next();
    });

        this.onMembersAdded(async (context, next) => {
        const membersAdded = context.activity.membersAdded;
        //write a custom greeting
        const welcomeText = 'Welcome to Dental office virtual assistance. I can help you with information about treatment, insurance, scheduling and deleting the appointment.';
        for (let cnt = 0; cnt < membersAdded.length; ++cnt) {
            if (membersAdded[cnt].id !== context.activity.recipient.id) {
                await context.sendActivity(MessageFactory.text(welcomeText, welcomeText));
            }
        }
        // by calling next() you ensure that the next BotHandler is run.
        await next();
    });
    }
}

module.exports.DentaBot = DentaBot;
