const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// Replace with your actual bot token and MongoDB API key
const token = 'xxxxxxxxxxxx';
const mongo_apiKey = 'xxxxxxxxx';

const bot = new TelegramBot(token, { polling: true });

// Map to store user states
const userStates = new Map();

// Function to reset user state
const resetUserState = (chatId) => {
  userStates.set(chatId, { state: 'initial' });
};

// Initial user state if the user messages: /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'Please enter your Client ID');
  userStates.set(chatId, { state: 'awaitingClientId' });
});

// Listener for messages
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  const userState = userStates.get(chatId) || { state: 'initial' };

  switch (userState.state) {
    case 'awaitingClientId':
      userState.clientId = text;
      userState.state = 'awaitingEmail';
      bot.sendMessage(chatId, 'Please enter the email you signed up with');
      userStates.set(chatId, userState);
      break;
    case 'awaitingEmail':
      userState.email = text;

      // Check with MongoDB
      const data = {
        collection: 'odinscollection',
        database: 'odinsdatabase',
        dataSource: 'odinsdatasource',
        filter: {
          client_id: parseInt(userState.clientId, 10),
          email: userState.email
        }
      };

      axios.post('https://eu-west-2.aws.data.mongodb-api.com/app/data-qdgdb/endpoint/data/v1/action/findOne', data, {
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Request-Headers': '*',
          'api-key': mongo_apiKey
        }
      })
      .then(response => {
        const document = response.data.document;
        if (document) {
          userState.state = 'awaitingTopics';
          bot.sendMessage(chatId, 'How many topics would you like: 1, 2, 3, 4');
          userStates.set(chatId, userState);
        } else {
          bot.sendMessage(chatId, 'Client ID and/or Email incorrect, try again or purchase from dexscan-ai.com and come back with your Client ID and Email');
          bot.sendMessage(chatId, 'Once you know your Client ID and Email, send this to try again: /start ');
          resetUserState(chatId);
        }
      })
      .catch(err => {
        console.error('MongoDB query error:', err);
        bot.sendMessage(chatId, 'An error occurred. Please try again later.');
        resetUserState(chatId);
      });
      break;
    case 'awaitingTopics':
      if (['1', '2', '3', '4'].includes(text)) {
        userState.numTopics = parseInt(text, 10);
        userState.currentTopic = 1;
        userState.topics = [];
        bot.sendMessage(chatId, `What Topic ${userState.currentTopic} would you like?`);
        userState.state = 'collectingTopics';
        userStates.set(chatId, userState);
      } else {
        bot.sendMessage(chatId, 'Please enter one of the options: 1, 2, 3, or 4');
      }
      break;
    case 'collectingTopics':
      userState.topics.push(text);
      if (userState.topics.length < userState.numTopics) {
        userState.currentTopic += 1;
        bot.sendMessage(chatId, `What Topic ${userState.currentTopic} would you like?`);
      } else {
        // Fill remaining topics with '0'
        while (userState.topics.length < 4) {
          userState.topics.push('0');
        }

        // Update MongoDB with the collected topics
        const updateData = {
          collection: 'odinscollection',
          database: 'odinsdatabase',
          dataSource: 'odinsdatasource',
          filter: {
            client_id: parseInt(userState.clientId, 10),
            email: userState.email
          },
          update: {
            $set: {
              chat_id_telegram: chatId,
              topic1: userState.topics[0],
              topic2: userState.topics[1],
              topic3: userState.topics[2],
              topic4: userState.topics[3]
            }
          }
        };

        axios.post('https://eu-west-2.aws.data.mongodb-api.com/app/data-qdgdb/endpoint/data/v1/action/updateOne', updateData, {
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Request-Headers': '*',
            'api-key': mongo_apiKey
          }
        })
        .then(response => {
          bot.sendMessage(chatId, 'Your topics have been updated successfully.');

          // Send HTTP request to 
          axios.post('https://europe-west2-my-project.com', {
            client_id: parseInt(userState.clientId, 10),
            email: userState.email
          })
          .then(() => {
            console.log('HTTP request sent');
            // Wait for 5 seconds before proceeding
            setTimeout(() => {
              console.log('Waited 5 seconds after HTTP request');
              resetUserState(chatId);
            }, 5000);
          })
          .catch(err => {
            console.error('Error sending HTTP request:', err);
            resetUserState(chatId);
          });

        })
        .catch(err => {
          console.error('MongoDB update error:', err);
          bot.sendMessage(chatId, 'An error occurred while updating your topics. Please try again later.');
          resetUserState(chatId);
        });
      }
      userStates.set(chatId, userState);
      break;
    default:
      resetUserState(chatId);
      break;
  }
});

console.log('Bot is running...');
