"use strict";
exports.__esModule = true;
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
exports.mockVisitorNavigation = {
    token: '123456789',
    rid: '',
    pageInfo: {
        change: 'url',
        title: 'Livechat Demo Page',
        location: {
            href: 'http://localhost:3000/assets/demo.html#page-1'
        }
    }
};
exports.mockCustomField = {
    token: '123456789',
    key: 'address',
    value: 'Rocket.Chat Avenue',
    overwrite: true
};
exports.mockCustomFields = {
    token: '123456789',
    customFields: [
        {
            key: 'address',
            value: 'Rocket.Chat Avenue - Porto Alegre',
            overwrite: true
        },
        {
            key: 'state',
            value: 'RS',
            overwrite: true
        }
    ]
};
