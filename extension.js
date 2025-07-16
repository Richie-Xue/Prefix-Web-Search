// extension.js
// Project Name: Prefix Web Search
// Author: Richie Xue (richie37xue@gmail.com)
// License: GNU General Public License as published by the Free Software Foundation,
// either version 2 of the License, or (at your option) any later version.
// SPDX-License-Identifier: GPL-2.0-or-later

// Import necessary Gnome Shell modules
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

// --- Search Provider Class ---
class PrefixWebSearchProvider {
    constructor(extension, searchEnginesConfig) {
        this._extension = extension;
        this._lastParsedTerms = [];
        this._searchEnginesMap = new Map();

        // Populate the map from the loaded configuration, now without description fields
        searchEnginesConfig.forEach(engine => {
            this._searchEnginesMap.set(engine.prefix, {
                url: engine.url,
                // display_name is not used for result name, but kept for clarity if needed later
                // description_template and empty_query_description removed
                empty_query_url: engine.empty_query_url // Optional, for direct homepage redirects
            });
        });

        // Ensure a default is always available
        if (!this._searchEnginesMap.has('_default_')) {
            this._searchEnginesMap.set('_default_', {
                url: 'https://www.google.com/search?q={query}'
            });
        }
    }

    // --- Search Provider API Methods ---

    get name() {
        return 'Prefix Web Search'; // This is the category title in the overview
    }

    get appInfo() { return null; }
    get canLaunchSearch() { return true; }
    get id() { return this._extension.uuid; }

    /**
     * Called when a search result is activated (e.g., user presses Enter).
     * @param {string} resultId - The identifier of the activated result.
     * @param {string[]} terms - The original search terms entered by the user.
     */
    activateResult(resultId, termsToUse) {
        log(`[${this._extension.uuid}] ACTIVATE_RESULT CALLED:`);
        log(`[${this._extension.uuid}]   resultId: ${resultId}`);
        log(`[${this._extension.uuid}]   terms (passed to function): ${termsToUse.join(' ')}`);
        log(`[${this._extension.uuid}]   _lastParsedTerms (stored): ${this._lastParsedTerms.join(' ')}`);

        const fullInputString = termsToUse.join(' ');

        const urlRegexFromWorkingExtension = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/;

        const isDirectUrl = urlRegexFromWorkingExtension.test(fullInputString) &&
                            fullInputString.match(urlRegexFromWorkingExtension)?.[0]?.length === fullInputString.length;

        let targetUrl = '';

        if (isDirectUrl) {
            targetUrl = fullInputString;
        } else {
            const firstTerm = termsToUse[0]?.toLowerCase();
            let actualSearchTerms;
            let engineConfig;

            if (this._searchEnginesMap.has(firstTerm)) {
                engineConfig = this._searchEnginesMap.get(firstTerm);
                actualSearchTerms = termsToUse.slice(1);
            } else {
                engineConfig = this._searchEnginesMap.get('_default_');
                actualSearchTerms = termsToUse;
            }

            // Keep empty_query_url logic for direct homepage redirects (e.g., Bilibili)
            if (actualSearchTerms.length === 0 && engineConfig.empty_query_url) {
                targetUrl = engineConfig.empty_query_url;
            } else {
                const searchQueryParam = actualSearchTerms.map(encodeURIComponent).join('+');
                targetUrl = engineConfig.url.replace('{query}', searchQueryParam);
            }
        }

        let cmd = `xdg-open `;
        if (isDirectUrl) {
            if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
                cmd += targetUrl;
            } else {
                cmd += `https://${targetUrl}`;
            }
        } else {
            cmd += `"${targetUrl}"`;
        }

        log(`[${this._extension.uuid}] Launching final command: ${cmd}`);
        GLib.spawn_command_line_async(cmd);
    }

    launchSearch(terms) { return null; }
    createResultObject(meta) { return null; }

    /**
     * Provides metadata (name, description, icon) for search results.
     * @param {string[]} resultIds - The identifiers returned by getInitialResultSet.
     * @returns {Promise<Object[]>} A promise resolving to an array of metadata objects.
     */
    getResultMetas(resultIds, cancellable = null) {
        return new Promise((resolve, reject) => {
            try {
                const resultMetas = [];
                const currentTerms = this._lastParsedTerms;
                log(`[${this._extension.uuid}] getResultMetas CALLED for resultIds: ${resultIds.join(', ')} with currentTerms: ${currentTerms.join(' ')}`);

                const createIcon = (size) => {
                    log(`[${this._extension.uuid}] Attempting to create St.Icon for size: ${size}`);
                    const icon = new St.Icon({
                        gicon: new Gio.ThemedIcon({ name: 'web-browser-symbolic' }),
                        icon_size: size,
                    });
                    log(`[${this._extension.uuid}] Successfully created St.Icon.`);
                    return icon;
                };

                for (let id of resultIds) {
                    let name = '';
                    let description = ''; // Initialize as empty

                    if (id === 'direct-url') {
                        name = 'Open URL';
                        description = ''; // No description for direct URL
                        log(`[${this._extension.uuid}]   Result ID: ${id}, Name: "${name}", Description: "${description}"`);
                    } else if (id === 'custom-search') {
                        // For custom search, name is fixed and description is empty
                        name = 'Prefix Web Search';
                        description = ''; // Explicitly set to empty string
                        log(`[${this._extension.uuid}]   Result ID: ${id}, Name: "${name}", Description: "${description}"`);
                    }

                    resultMetas.push({
                        id: id,
                        name: name,
                        description: description, // Always empty
                        createIcon: createIcon
                    });
                }
                log(`[${this._extension.uuid}] getResultMetas resolving with ${resultMetas.length} results.`);
                resolve(resultMetas);
            } catch (e) {
                log(`[${this._extension.uuid}] ERROR in getResultMetas: ${e}`);
                reject(e);
            }
        });
    }

    /**
     * Initiates a new search based on user input.
     * @param {string[]} terms - The search terms
     * @param {Gio.Cancellable} [cancellable] - A cancellable for the operation
     * @returns {Promise<string[]>} A list of result identifiers
     */
    getInitialResultSet(terms, cancellable = null) {
        return new Promise((resolve, reject) => {
            try {
                log(`[${this._extension.uuid}] GET_INITIAL_RESULT_SET CALLED with terms: ${terms.join(' ')}`);
                this._lastParsedTerms = terms;

                if (terms.length === 0) {
                    log(`[${this._extension.uuid}] GET_INITIAL_RESULT_SET: No terms, resolving with empty array.`);
                    resolve([]);
                    return;
                }

                const firstTerm = terms[0]?.toLowerCase();
                const fullInput = terms.join(' ');

                const urlRegexForInitialResultSet = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/;
                const isDirectUrlInResultSet = urlRegexForInitialResultSet.test(fullInput) &&
                                               fullInput.match(urlRegexForInitialResultSet)?.[0]?.length === fullInput.length;


                const identifiers = [];

                if (isDirectUrlInResultSet) {
                    identifiers.push('direct-url');
                    log(`[${this._extension.uuid}] GET_INITIAL_RESULT_SET: Identified as direct URL.`);
                }
                else if (this._searchEnginesMap.has(firstTerm)) {
                    identifiers.push('custom-search');
                    log(`[${this._extension.uuid}] GET_INITIAL_RESULT_SET: Identified as custom search with prefix "${firstTerm}".`);
                }
                else if (terms.length > 0) {
                    identifiers.push('custom-search');
                    log(`[${this._extension.uuid}] GET_INITIAL_RESULT_SET: Identified as default web search.`);
                }

                log(`[${this._extension.uuid}] GET_INITIAL_RESULT_SET: Resolving with identifiers: ${identifiers.join(', ')}`);
                resolve(identifiers);
            } catch (e) {
                log(`[${this._extension.uuid}] ERROR in getInitialResultSet: ${e}`);
                reject(e);
            }
        });
    }

    getSubsearchResultSet(results, terms, cancellable = null) {
        log(`[${this._extension.uuid}] getSubsearchResultSet CALLED.`);
        return this.getInitialResultSet(terms, cancellable);
    }

    filterResults(results, maxResults) {
        log(`[${this._extension.uuid}] filterResults CALLED. Results count: ${results.length}, Max Results: ${maxResults}`);
        if (results.length <= maxResults)
            return results;
        return results.slice(0, maxResults);
    }
}

// --- Main Extension Class ---

export default class PrefixWebSearchExtension extends Extension {
    constructor(meta) {
        super(meta);
        this._provider = null;
        this._searchEnginesConfig = null;
        this._textDecoder = null;
    }

    // Helper to load the search engines config from file
    _loadSearchEnginesConfig() {
        try {
            this._textDecoder = new TextDecoder();
            const configFile = this.dir.get_child('search_engines.json');
            const [, contentsBytes] = configFile.load_contents(null);
            const jsonString = this._textDecoder.decode(contentsBytes);
            this._searchEnginesConfig = JSON.parse(jsonString);
            log(`[${this.uuid}] Successfully loaded search_engines.json`);
        } catch (e) {
            log(`[${this.uuid}] ERROR loading search_engines.json: ${e.message}`);
            // Fallback config with minimal fields
            this._searchEnginesConfig = [
                { "prefix": "gg", "url": "https://www.google.com/search?q={query}" },
                { "prefix": "_default_", "url": "https://www.google.com/search?q={query}" }
            ];
            log(`[${this.uuid}] Using fallback search engine configuration.`);
        }
    }

    // Called when the extension is enabled
    enable() {
        if (this._searchEnginesConfig === null) {
            this._loadSearchEnginesConfig();
        }

        if (this._provider === null) {
            this._provider = new PrefixWebSearchProvider(this, this._searchEnginesConfig);
            Main.overview.searchController.addProvider(this._provider);
            log(`[${this.uuid}] Prefix Web Search Extension Enabled`);
        }
    }

    // Called when the extension is disabled
    disable() {
        if (this._provider instanceof PrefixWebSearchProvider) {
            Main.overview.searchController.removeProvider(this._provider);
            this._provider = null;
        }
        this._searchEnginesConfig = null;
        this._textDecoder = null;
        log(`[${this.uuid}] Prefix Web Search Extension Disabled`);
    }
}

