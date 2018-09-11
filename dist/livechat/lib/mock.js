"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockVisitor = {
    visitor: {
        name: 'Livechat Visitor',
        email: 'visitor@rocket.chat',
        token: '123456789',
        phone: '55 51 5555-5555',
        customFields: [{
                key: 'address',
                value: 'Rocket.Chat street',
                overwrite: true
            }]
    }
};
exports.mockSurvey = [
    {
        name: 'satisfaction',
        value: '3'
    },
    {
        name: 'agentResposiveness',
        value: '5'
    }
];
exports.mockOfflineMessage = {
    name: 'Livechat Visitor',
    email: 'sample@rocket.chat',
    message: 'This is a Message!'
};
//# sourceMappingURL=mock.js.map