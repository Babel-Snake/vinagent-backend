'use strict';

module.exports = {
    up: async (queryInterface, Sequelize) => {
        // 1. Update Wineries Table
        await queryInterface.addColumn('Wineries', 'shortName', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'keyDescriptors', { type: Sequelize.JSON }); // Array of strings

        // Address fields
        await queryInterface.addColumn('Wineries', 'addressLine1', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'addressLine2', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'suburb', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'state', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'postcode', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'country', { type: Sequelize.STRING, defaultValue: 'Australia' });

        // Public contacts (distinct from internal ops contacts)
        await queryInterface.addColumn('Wineries', 'publicPhone', { type: Sequelize.STRING });
        await queryInterface.addColumn('Wineries', 'publicEmail', { type: Sequelize.STRING });


        // 2. Create WineryBrandProfiles
        await queryInterface.createTable('WineryBrandProfiles', {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
            wineryId: {
                type: Sequelize.INTEGER, allowNull: false, unique: true,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            brandStoryShort: { type: Sequelize.TEXT },
            tonePreset: { type: Sequelize.ENUM('warm', 'premium', 'playful', 'rustic', 'formal') },
            voiceGuidelines: { type: Sequelize.TEXT }, // Bullet points
            doSayExamples: { type: Sequelize.JSON }, // Array
            dontSayExamples: { type: Sequelize.JSON }, // Array
            signOffDefault: { type: Sequelize.STRING },
            spellingLocale: { type: Sequelize.STRING, defaultValue: 'AU' },
            emojisAllowed: { type: Sequelize.BOOLEAN, defaultValue: true },
            formalityLevel: { type: Sequelize.INTEGER, defaultValue: 3 }, // 1-5
            readingLevel: { type: Sequelize.STRING, defaultValue: 'standard' },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });

        // 3. Create WineryBookingsConfigs (Global Rules)
        await queryInterface.createTable('WineryBookingsConfigs', {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
            wineryId: {
                type: Sequelize.INTEGER, allowNull: false, unique: true,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            walkInsAllowed: { type: Sequelize.BOOLEAN, defaultValue: true },
            walkInNotes: { type: Sequelize.TEXT },
            groupBookingThreshold: { type: Sequelize.INTEGER, defaultValue: 8 },
            leadTimeHours: { type: Sequelize.INTEGER, defaultValue: 24 },
            cancellationPolicyText: { type: Sequelize.TEXT },
            kidsPolicy: { type: Sequelize.TEXT },
            petsPolicy: { type: Sequelize.TEXT },
            defaultResponseStrategy: { type: Sequelize.ENUM('confirm', 'create_task'), defaultValue: 'create_task' },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });

        // 4. Create WineryBookingTypes (Experiences)
        await queryInterface.createTable('WineryBookingTypes', {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
            wineryId: {
                type: Sequelize.INTEGER, allowNull: false,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            name: { type: Sequelize.STRING, allowNull: false },
            durationMinutes: { type: Sequelize.INTEGER },
            priceCents: { type: Sequelize.INTEGER, defaultValue: 0 },
            currency: { type: Sequelize.STRING, defaultValue: 'AUD' },
            minGuests: { type: Sequelize.INTEGER, defaultValue: 1 },
            maxGuests: { type: Sequelize.INTEGER },
            daysAvailable: { type: Sequelize.JSON }, // Array of days/rules
            requiresDeposit: { type: Sequelize.BOOLEAN, defaultValue: false },
            depositCents: { type: Sequelize.INTEGER, defaultValue: 0 },
            notesForGuests: { type: Sequelize.TEXT },
            isActive: { type: Sequelize.BOOLEAN, defaultValue: true },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });

        // 5. Update WineryProducts (Enhancements)
        // First check if table exists (it was created in prev migration, but just in case)
        // Assuming it exists from 20250101000005
        await queryInterface.addColumn('WineryProducts', 'vintage', { type: Sequelize.STRING });
        await queryInterface.addColumn('WineryProducts', 'keySellingPoints', { type: Sequelize.JSON }); // Array
        await queryInterface.addColumn('WineryProducts', 'pairingSuggestions', { type: Sequelize.TEXT });
        await queryInterface.addColumn('WineryProducts', 'isFeatured', { type: Sequelize.BOOLEAN, defaultValue: false });
        await queryInterface.addColumn('WineryProducts', 'isActive', { type: Sequelize.BOOLEAN, defaultValue: true });


        // 6. Create WineryPolicyProfiles
        await queryInterface.createTable('WineryPolicyProfiles', {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
            wineryId: {
                type: Sequelize.INTEGER, allowNull: false, unique: true,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            shippingTimeframesText: { type: Sequelize.TEXT },
            shippingRegions: { type: Sequelize.JSON }, // Array of postcodes/states
            returnsRefundsPolicyText: { type: Sequelize.TEXT },
            wineClubSummary: { type: Sequelize.TEXT },
            accessibilityNotes: { type: Sequelize.TEXT },
            eventPolicy: { type: Sequelize.TEXT },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });

        // 7. Rename WineryPolicies -> WineryFAQItems
        // Since prev migration created WineryPolicies, we will rename it and adapt fields.
        // However, clean rename might be messy if constraints differ.
        // The previous WineryPolicies had: section, question, answer.
        // The new WineryFAQItems needs: question, answer, tags, isActive.
        // Let's rename the table and update columns.
        await queryInterface.renameTable('WineryPolicies', 'WineryFAQItems');
        await queryInterface.addColumn('WineryFAQItems', 'tags', { type: Sequelize.JSON }); // Array of strings
        await queryInterface.addColumn('WineryFAQItems', 'isActive', { type: Sequelize.BOOLEAN, defaultValue: true });
        // 'section' from old table can be migrated to 'tags' if we wanted, or just dropped/kept. I'll key 'section' as a legacy field or map it.
        // Let's keep 'section' for now as it maps to 'category' basically.

        // 8. Create WineryIntegrationConfigs
        await queryInterface.createTable('WineryIntegrationConfigs', {
            id: { allowNull: false, autoIncrement: true, primaryKey: true, type: Sequelize.INTEGER },
            wineryId: {
                type: Sequelize.INTEGER, allowNull: false, unique: true,
                references: { model: 'Wineries', key: 'id' },
                onUpdate: 'CASCADE', onDelete: 'CASCADE'
            },
            smsProvider: { type: Sequelize.STRING, defaultValue: 'twilio' },
            smsFromNumber: { type: Sequelize.STRING },
            emailProvider: { type: Sequelize.STRING, defaultValue: 'sendgrid' },
            emailFromAddress: { type: Sequelize.STRING },
            channelsEnabled: { type: Sequelize.JSON }, // { sms: true, email: true }
            kioskModeEnabled: { type: Sequelize.BOOLEAN, defaultValue: false },
            planTier: { type: Sequelize.ENUM('basic', 'advanced'), defaultValue: 'basic' },
            createdAt: { allowNull: false, type: Sequelize.DATE },
            updatedAt: { allowNull: false, type: Sequelize.DATE }
        });
    },

    down: async (queryInterface, Sequelize) => {
        // Drop in reverse order
        await queryInterface.dropTable('WineryIntegrationConfigs');

        // Reverse rename
        try {
            await queryInterface.removeColumn('WineryFAQItems', 'isActive');
            await queryInterface.removeColumn('WineryFAQItems', 'tags');
            await queryInterface.renameTable('WineryFAQItems', 'WineryPolicies');
        } catch (e) {
            console.warn('Rollback of FAQ rename failed or partial');
        }

        await queryInterface.dropTable('WineryPolicyProfiles');

        // Remove product columns
        await queryInterface.removeColumn('WineryProducts', 'isActive');
        await queryInterface.removeColumn('WineryProducts', 'isFeatured');
        await queryInterface.removeColumn('WineryProducts', 'pairingSuggestions');
        await queryInterface.removeColumn('WineryProducts', 'keySellingPoints');
        await queryInterface.removeColumn('WineryProducts', 'vintage');

        await queryInterface.dropTable('WineryBookingTypes');
        await queryInterface.dropTable('WineryBookingsConfigs');
        await queryInterface.dropTable('WineryBrandProfiles');

        // Remove Winery columns
        await queryInterface.removeColumn('Wineries', 'publicEmail');
        await queryInterface.removeColumn('Wineries', 'publicPhone');
        await queryInterface.removeColumn('Wineries', 'country');
        await queryInterface.removeColumn('Wineries', 'postcode');
        await queryInterface.removeColumn('Wineries', 'state');
        await queryInterface.removeColumn('Wineries', 'suburb');
        await queryInterface.removeColumn('Wineries', 'addressLine2');
        await queryInterface.removeColumn('Wineries', 'addressLine1');
        await queryInterface.removeColumn('Wineries', 'keyDescriptors');
        await queryInterface.removeColumn('Wineries', 'shortName');
    }
};
