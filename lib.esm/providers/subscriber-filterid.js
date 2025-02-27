import { PollingEventSubscriber } from "./subscriber-polling.js";
function copy(obj) {
    return JSON.parse(JSON.stringify(obj));
}
/**
 *  Some backends support subscribing to events using a Filter ID.
 *
 *  When subscribing with this technique, the node issues a unique
 *  //Filter ID//. At this point the node dedicates resources to
 *  the filter, so that periodic calls to follow up on the //Filter ID//
 *  will receive any events since the last call.
 *
 *  @_docloc: api/providers/abstract-provider
 */
export class FilterIdSubscriber {
    #provider;
    #filterIdPromise;
    #poller;
    #running;
    #network;
    #hault;
    constructor(provider) {
        this.#provider = provider;
        this.#filterIdPromise = null;
        this.#poller = this.#poll.bind(this);
        this.#running = false;
        this.#network = null;
        this.#hault = false;
    }
    _subscribe(provider) {
        throw new Error("subclasses must override this");
    }
    _emitResults(provider, result) {
        throw new Error("subclasses must override this");
    }
    _recover(provider) {
        throw new Error("subclasses must override this");
    }
    async #poll(blockNumber) {
        try {
            if (this.#filterIdPromise == null) {
                this.#filterIdPromise = this._subscribe(this.#provider);
            }
            const filterId = await this.#filterIdPromise;
            if (filterId == null) {
                this.#provider._recoverSubscriber(this, this._recover(this.#provider));
                return;
            }
            const network = await this.#provider.getNetwork();
            if (!this.#network) {
                this.#network = network;
            }
            if (this.#network.chainId !== network.chainId) {
                throw new Error("chaid changed");
            }
            if (this.#hault) {
                return;
            }
            const result = await this.#provider.send("eth_getFilterChanges", [filterId]);
            await this._emitResults(this.#provider, result);
        }
        catch (error) {
            console.log("@TODO", error);
        }
        this.#provider.once("block", this.#poller);
    }
    #teardown() {
        const filterIdPromise = this.#filterIdPromise;
        if (filterIdPromise) {
            this.#filterIdPromise = null;
            filterIdPromise.then((filterId) => {
                this.#provider.send("eth_uninstallFilter", [filterId]);
            });
        }
    }
    start() {
        if (this.#running) {
            return;
        }
        this.#running = true;
        this.#poll(-2);
    }
    stop() {
        if (!this.#running) {
            return;
        }
        this.#running = false;
        this.#hault = true;
        this.#teardown();
        this.#provider.off("block", this.#poller);
    }
    pause(dropWhilePaused) {
        if (dropWhilePaused) {
            this.#teardown();
        }
        this.#provider.off("block", this.#poller);
    }
    resume() { this.start(); }
}
/**
 *  A **FilterIdSubscriber** for receiving contract events.
 *
 *  @_docloc: api/providers/abstract-provider
 */
export class FilterIdEventSubscriber extends FilterIdSubscriber {
    #event;
    constructor(provider, filter) {
        super(provider);
        this.#event = copy(filter);
    }
    _recover(provider) {
        return new PollingEventSubscriber(provider, this.#event);
    }
    async _subscribe(provider) {
        const filterId = await provider.send("eth_newFilter", [this.#event]);
        return filterId;
    }
    async _emitResults(provider, results) {
        for (const result of results) {
            provider.emit(this.#event, provider._wrapLog(result, provider._network));
        }
    }
}
/**
 *  A **FilterIdSubscriber** for receiving pending transactions events.
 *
 *  @_docloc: api/providers/abstract-provider
 */
export class FilterIdPendingSubscriber extends FilterIdSubscriber {
    async _subscribe(provider) {
        return await provider.send("eth_newPendingTransactionFilter", []);
    }
    async _emitResults(provider, results) {
        for (const result of results) {
            provider.emit("pending", result);
        }
    }
}
//# sourceMappingURL=subscriber-filterid.js.map