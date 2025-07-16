// extension.js
// Project Name: Prefix Web Search
// Author: Richie Xue (richie37xue@gmail.com)
// License: GNU General Public License as published by the Free Software Foundation,
// either version 2 of the License, or (at your option) any later version.
// SPDX-License-Identifier: GPL-2.0-or-later

// Import necessary Gnome Shell modules
import Gio from 'gi://Gio';
import GLib from 'gi://GLib'; // Import GLib for spawn_command_line_async
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import St from 'gi://St'; // <--- NEW: Import St for UI elements like icons

// --- Search Provider Class ---
class PrefixWebSearchProvider {
    constructor(extension, searchEnginesConfig) {
        this._extension = extension;
        this._lastParsedTerms = [];
        this._searchEnginesMap = new Map();

        // Populate the map from the loaded configuration
        searchEnginesConfig.forEach(engine => {
            this._searchEnginesMap.set(engine.prefix, engine.url);
        });

        // Ensure a default is always available
        if (!this._searchEnginesMap.has('_default_')) {
            this._searchEnginesMap.set('_default_', 'https://www.google.com/search?q={query}');
        }
    }

    // --- Search Provider API Methods ---

    // <--- NEW: Add a get name() property for the search provider ---
    get name() {
        return 'Prefix Web Search'; // This name appears next to your results
    }
    // --- END NEW ---

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
        log(`[${this._extension.uuid}]   resultId: ${resultId}`);
        log(`[${this._extension.uuid}]   terms (passed to function): ${termsToUse.join(' ')}`);
        log(`[${this._extension.uuid}]   _lastParsedTerms (stored): ${this._lastParsedTerms.join(' ')}`);

        const fullInputString = termsToUse.join(' ');

        // Use the URL regex from the "working" extension, which proved reliable
        const urlRegexFromWorkingExtension = /(https?:\/\/)?(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&\/\/=]*)/;

        // Key condition from the "working" extension to determine if it's a direct URL
        const isDirectUrl = urlRegexFromWorkingExtension.test(fullInputString) &&
                            fullInputString.match(urlRegexFromWorkingExtension)?.[0]?.length === fullInputString.length;

        let targetUrl = '';

        if (isDirectUrl) {
            targetUrl = fullInputString;
        } else {
            // This branch uses YOUR existing prefix/default search logic for custom searches
            const firstTerm = termsToUse[0]?.toLowerCase();
            let actualSearchTerms;
            let urlTemplate;

            if (this._searchEnginesMap.has(firstTerm) && termsToUse.length > 1) {
                urlTemplate = this._searchEnginesMap.get(firstTerm);
                actualSearchTerms = termsToUse.slice(1);
            } else {
                urlTemplate = this._searchEnginesMap.get('_default_');
                actualSearchTerms = termsToUse;
            }

            const searchQueryParam = actualSearchTerms.map(encodeURIComponent).join('+');
            targetUrl = urlTemplate.replace('{query}', searchQueryParam);
        }

        // --- FINAL LAUNCH LOGIC ---
        let cmd = `xdg-open `;
        if (isDirectUrl) {
            // For direct URLs, ensure http/https prefix. No quoting needed for xdg-open if it's a clean URL.
            if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
                cmd += targetUrl;
            } else {
                cmd += `https://${targetUrl}`;
            }
        } else {
            // For search queries, always quote the URL for xdg-open to handle spaces correctly.
            cmd += `"${targetUrl}"`;
        }
        // --- END FINAL LAUNCH LOGIC ---

        log(`[${this._extension.uuid}] Launching final command: ${cmd}`);
        GLib.spawn_command_line_async(cmd); // Using the method that works!
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

                // Function to create an St.Icon from a themed icon name
                const createIcon = (size) => {
                    log(`[${this._extension.uuid}] Attempting to create St.Icon for size: ${size}`);
                    const icon = new St.Icon({
                        gicon: new Gio.ThemedIcon({ name: 'web-browser-symbolic' }), // Use a standard system icon
                        icon_size: size,
                    });
                    log(`[${this._extension.uuid}] Successfully created St.Icon.`);
                    return icon;
                };

                for (let id of resultIds) {
                    let name = '';
                    let description = '';

                    if (id === 'direct-url') {
                        name = 'Open URL';
                        description = `Open "${currentTerms.join(' ')}"`;
                    } else if (id === 'custom-search') {
                        const firstTerm = currentTerms[0]?.toLowerCase();
                        const hasValidPrefix = this._searchEnginesMap.has(firstTerm) && currentTerms.length > 1;

                        let displayQuery = '';
                        let engineName = 'Web';

                        if (hasValidPrefix) {
                            displayQuery = currentTerms.slice(1).join(' ');
                            engineName = Object.keys(Object.fromEntries(this._searchEnginesMap)).find(key => key === firstTerm) || 'Web';
                            name = `Search ${engineName.toUpperCase()}`;
                        } else {
                            displayQuery = currentTerms.join(' ');
                            engineName = Object.keys(Object.fromEntries(this._searchEnginesMap)).find(key => key === '_default_') || 'Web';
                            name = 'Prefix Web Search';
                        }

                        description = `Search for "${displayQuery}" on ${engineName.toUpperCase()}`;
                    }

                    // <--- NEW: Add createIcon to the result meta ---
                    resultMetas.push({
                        id: id,
                        name: name,
                        description: description,
                        createIcon: createIcon // Attach the icon creation function
                    });
                    // --- END NEW ---
                }
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
                } else if (this._searchEnginesMap.has(firstTerm) && terms.length > 1) {
                    identifiers.push('custom-search');
                } else if (terms.length > 0) {
                    identifiers.push('custom-search');
                }

                resolve(identifiers);
            } catch (e) {
                log(`[${this._extension.uuid}] ERROR in getInitialResultSet: ${e}`);
                reject(e);
            }
        });
    }

    getSubsearchResultSet(results, terms, cancellable = null) {
        return this.getInitialResultSet(terms, cancellable);
    }

    filterResults(results, maxResults) {
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
