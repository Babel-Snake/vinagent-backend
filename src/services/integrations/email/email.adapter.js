class EmailAdapter {
    constructor(config = {}) {
        this.config = config;
    }

    isAuthenticated() {
        return false;
    }

    async listInboxMessages() {
        throw new Error('listInboxMessages() not implemented');
    }

    async sendEmail() {
        throw new Error('sendEmail() not implemented');
    }
}

module.exports = EmailAdapter;
