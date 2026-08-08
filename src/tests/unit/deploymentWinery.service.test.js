describe('deploymentWinery service', () => {
    const originalWineryId = process.env.DEPLOYMENT_WINERY_ID;

    afterEach(() => {
        jest.resetModules();
        if (originalWineryId === undefined) delete process.env.DEPLOYMENT_WINERY_ID;
        else process.env.DEPLOYMENT_WINERY_ID = originalWineryId;
    });

    function loadService(Winery) {
        jest.doMock('../../models', () => ({ Winery }));
        jest.doMock('../../config/logger', () => ({ error: jest.fn() }));
        return require('../../services/deploymentWinery.service');
    }

    it('uses the explicitly configured deployment winery', async () => {
        process.env.DEPLOYMENT_WINERY_ID = '7';
        const winery = { id: 7, name: 'Configured Winery' };
        const Winery = {
            findByPk: jest.fn().mockResolvedValue(winery),
            findAll: jest.fn()
        };

        const { resolveDeploymentWinery } = loadService(Winery);

        await expect(resolveDeploymentWinery()).resolves.toBe(winery);
        expect(Winery.findByPk).toHaveBeenCalledWith(7);
        expect(Winery.findAll).not.toHaveBeenCalled();
    });

    it('uses the only winery when local data is unambiguous', async () => {
        delete process.env.DEPLOYMENT_WINERY_ID;
        const winery = { id: 3, name: 'Only Winery' };
        const Winery = { findAll: jest.fn().mockResolvedValue([winery]) };

        const { resolveDeploymentWinery } = loadService(Winery);

        await expect(resolveDeploymentWinery()).resolves.toBe(winery);
    });

    it('fails closed when no configured winery can be resolved', async () => {
        delete process.env.DEPLOYMENT_WINERY_ID;
        const Winery = { findAll: jest.fn().mockResolvedValue([]) };

        const { resolveDeploymentWinery } = loadService(Winery);

        await expect(resolveDeploymentWinery()).rejects.toMatchObject({
            statusCode: 503,
            code: 'DEPLOYMENT_WINERY_REQUIRED'
        });
    });

    it('fails closed when an unconfigured database contains multiple wineries', async () => {
        delete process.env.DEPLOYMENT_WINERY_ID;
        const Winery = { findAll: jest.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]) };

        const { resolveDeploymentWinery } = loadService(Winery);

        await expect(resolveDeploymentWinery()).rejects.toMatchObject({
            statusCode: 503,
            code: 'DEPLOYMENT_WINERY_REQUIRED'
        });
    });
});
