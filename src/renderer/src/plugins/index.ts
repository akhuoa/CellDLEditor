/******************************************************************************

CellDL Editor

Copyright (c) 2022 - 2025 David Brooks

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

******************************************************************************/
/** biome-ignore-all lint/style/noNonNullAssertion: <keys exist in Map> */

import * as vue from 'vue'

//==============================================================================

import type {
    CellDLConnection,
    CellDLObject
} from '@editor/celldlObjects/index'
import { CELLDL_CLASS_MAP } from '@editor/celldlObjects/index'
import type { Constructor } from '@renderer/common/types'
import type {
    ComponentLibrary,
    LibraryComponentTemplate,
    ObjectTemplate,
} from '@editor/components/index'
import type {
    PropertyGroup,
    StyleObject,
    ValueChange
} from '@editor/components/properties'
import { STYLING_GROUP } from '@editor/components/properties'
import type {
    MetadataPropertiesMap,
    RdfStore,
    Statement,
    SubjectType
} from '@renderer/metadata/index'
import { CELLDL_URI, fragment, SPARQL_PREFIXES } from '@renderer/metadata/index'

//==============================================================================

export interface ConnectionStatus {
    alert?: string
    domain?: string
}

//==============================================================================

export interface PluginInterface {
    id: string

    componentLibrary: ComponentLibrary
    getPropertyGroups: () => PropertyGroup[]
    rdfStatements: () => Statement[]
    styleRules: () => string
    svgDefinitions: () => string

    newDocument: (uri: string, rdfStore: RdfStore) => void
    addDocumentMetadataToStore: (rdfStore: RdfStore) => void
    getPluginData: (celldlObject: CellDLObject, rdfStore: RdfStore) => object

    addNewConnection: (connection: CellDLConnection, rdfStore: RdfStore) => void
    checkConnectionValid: (startObject: CellDLObject, endObject: CellDLObject) => ConnectionStatus|undefined
    deleteConnection: (connection: CellDLConnection, rdfStore: RdfStore) => void
    getMaxConnections: (celldlObject: CellDLObject) => number

    getObjectTemplateById: (id: string) => ObjectTemplate|undefined
    getTemplateName: (rdfType: string) => string|undefined
    updateComponentProperties: (celldlObject: CellDLObject,
                             componentProperties: PropertyGroup[], rdfStore: RdfStore) => void
    updateObjectProperties: (celldlObject: CellDLObject, itemId: string, value: ValueChange,
                                componentProperties: PropertyGroup[], rdfStore: RdfStore) => Promise<void>
    updateComponentStyling: (celldlObject: CellDLObject, objectType: string, styling: StyleObject) =>  Promise<void>
}

//==============================================================================

export class ComponentLibraryPlugin {
    static #instance: ComponentLibraryPlugin | null = null

    #app: vue.App|undefined = undefined
    #registeredPlugins: Map<string, PluginInterface> = new Map()

    #componentLibraries: ComponentLibrary[] = []
    #componentLibrariesRef = vue.ref<ComponentLibrary[]>(this.#componentLibraries)
    #currentDocumentUri: string = ''

    private constructor() {
        if (ComponentLibraryPlugin.#instance) {
            throw new Error('Use ComponentLibraryPlugin.instance instead of `new`')
        }
        ComponentLibraryPlugin.#instance = this
    }

    static get instance() {
        if (!ComponentLibraryPlugin.#instance) {
            ComponentLibraryPlugin.#instance = new ComponentLibraryPlugin()
        }
        return ComponentLibraryPlugin.#instance
    }

    install(app: vue.App, _options: object|undefined=undefined)  {
        if (!this.#app) {
            app.provide<vue.Ref<ComponentLibrary[]>>('componentLibraries', this.#componentLibrariesRef)
            this.#app = app
        }
    }

    rdfStatements(pluginId: string): Statement[] {
        if (this.#registeredPlugins.has(pluginId)) {
            return this.#registeredPlugins.get(pluginId)!.rdfStatements()
        }
        return []
    }

    registerPlugin(plugin: PluginInterface) {
        if (!this.#registeredPlugins.has(plugin.id)) {
            this.#componentLibraries.push(plugin.componentLibrary)
            this.#registeredPlugins.set(plugin.id, plugin)
        }
    }

    getSelectedTemplate(): LibraryComponentTemplate|undefined {
        let selectedTemplate: LibraryComponentTemplate|undefined
        if (this.#componentLibraries.length &&
            this.#componentLibraries[0]!.templates.length) {

            // Select the default component template
            selectedTemplate = this.#componentLibraries[0]!.templates[0]
            if (selectedTemplate) {
                selectedTemplate.selected = true
            }
        }
        return selectedTemplate
    }

    //==========================================================================

    newDocument(uri: string, rdfStore: RdfStore) {
        this.#currentDocumentUri = uri
        for (const plugin of this.#registeredPlugins.values()) {
            plugin.newDocument(uri, rdfStore)
        }
    }

    addDocumentMetadataToStore(rdfStore: RdfStore) {
        for (const plugin of this.#registeredPlugins.values()) {
            plugin.addDocumentMetadataToStore(rdfStore)
        }
    }

    //==========================================================================

    addNewConnection(connection: CellDLConnection, rdfStore: RdfStore) {
        for (const plugin of this.#registeredPlugins.values()) {
            plugin.addNewConnection(connection, rdfStore)
        }
    }

    checkConnectionValid(startObject: CellDLObject, endObject: CellDLObject): ConnectionStatus|undefined
    {
        for (const plugin of this.#registeredPlugins.values()) {
            const status = plugin.checkConnectionValid(startObject, endObject)
            if (status) {
                return status
            }
        }
    }

    deleteConnection(connection: CellDLConnection, rdfStore: RdfStore) {
        for (const plugin of this.#registeredPlugins.values()) {
            plugin.deleteConnection(connection, rdfStore)
        }
    }

    getMaxConnections(celldlObject: CellDLObject): number {
        for (const pluginId of celldlObject.pluginIds) {
            const plugin = this.#registeredPlugins.get(pluginId)
            if (plugin) {
                return plugin.getMaxConnections(celldlObject)
            }
        }
        return Infinity
    }

    //==========================================================================

    getPluginData(celldlObject: CellDLObject, rdfStore: RdfStore): Map<string, object> {
        const pluginDataMap: Map<string, object> = new Map()
        for (const plugin of this.#registeredPlugins.values()) {
            pluginDataMap.set(plugin.id, plugin.getPluginData(celldlObject, rdfStore))
        }
        return pluginDataMap
    }

    getObjectTemplate(uri: SubjectType, metadata: MetadataPropertiesMap, rdfStore: RdfStore): ObjectTemplate|undefined {
        let CellDLClass: Constructor<CellDLObject>|undefined
        const rdfTypes: string[] = []
        const rows = rdfStore.query(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            SELECT ?type WHERE {
                ${uri.toString()} a ?type
            }`
        )
        for (const r of rows) {
            const rdfType = r.get('type')!.value
            if (rdfType.startsWith(CELLDL_URI) && CELLDL_CLASS_MAP.has(fragment(rdfType))) {
                if (CellDLClass === undefined) {
                    CellDLClass = CELLDL_CLASS_MAP.get(fragment(rdfType))
                }
            } else {
                rdfTypes.push(rdfType)
            }
        }
        if (CellDLClass) {
            const objectTemplate: ObjectTemplate = {
                CellDLClass: CellDLClass,
                metadataProperties: metadata
            }
            for (const plugin of this.#registeredPlugins.values()) {
                for (const rdfType of rdfTypes) {
                    const name = plugin.getTemplateName(rdfType)
                    if (name) {
                        objectTemplate.name = name
                        return objectTemplate
                    }
                }
            }
            return objectTemplate
        }
    }

    getObjectTemplateById(fullId: string): ObjectTemplate|undefined {
        const pluginTemplateId = fullId.split('/')
        if (pluginTemplateId.length > 1) {
            const plugin = this.#registeredPlugins.get(pluginTemplateId[0]!)
            if (plugin) {
                return plugin.getObjectTemplateById(pluginTemplateId.slice(1).join('/'))
            }
        }
    }

    //==========================================================================

    updateComponentProperties(celldlObject: CellDLObject,
                           componentProperties: PropertyGroup[], rdfStore: RdfStore): void {
        for (const pluginId of celldlObject.pluginIds) {
            const plugin = this.#registeredPlugins.get(pluginId)
            if (plugin) {
                plugin.updateComponentProperties(celldlObject, componentProperties, rdfStore)
            }
        }
    }

    async updateComponentStyling(celldlObject: CellDLObject, objectType: string, styling: StyleObject) {
        for (const pluginId of celldlObject.pluginIds) {
            const plugin = this.#registeredPlugins.get(pluginId)
            if (plugin) {
                await plugin.updateComponentStyling(celldlObject, objectType, styling)
            }
        }
    }

    async updateObjectProperties(celldlObject: CellDLObject, itemId: string, value: ValueChange,
                                    componentProperties: PropertyGroup[], rdfStore: RdfStore) {
        for (const pluginId of celldlObject.pluginIds) {
            const plugin = this.#registeredPlugins.get(pluginId)
            if (plugin) {
                await plugin.updateObjectProperties(celldlObject, itemId, value, componentProperties, rdfStore)
            }
        }
    }

    //==========================================================================

    getPropertyGroups(): PropertyGroup[] {
        const propertyGroups: PropertyGroup[] = []
        for (const plugin of this.#registeredPlugins.values()) {
            propertyGroups.push(...plugin.getPropertyGroups())
        }
        return propertyGroups
    }

    getStylingGroup(): PropertyGroup {
        return STYLING_GROUP
    }

    //==========================================================================

    // Global style rules and definitions added to the diagram's SVG

    styleRules(): string {
        const styling: string[] = []
        for (const plugin of this.#registeredPlugins.values()) {
            styling.push(plugin.styleRules())
        }
        return styling.join('\n')
    }

    svgDefinitions(): string {
        const definitions: string[] = []
        for (const plugin of this.#registeredPlugins.values()) {
            definitions.push(plugin.svgDefinitions())
        }
        return definitions.join('\n')
    }
}

//==============================================================================

// Instantiate our plugin components. This will load the BondgraphPlugin
// and hence BG template definitions from the BG-RDF framework

export const componentLibraryPlugin = ComponentLibraryPlugin.instance

//==============================================================================
//==============================================================================
