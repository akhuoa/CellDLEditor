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

import { ucum } from '@atomic-ehr/ucum'

//==============================================================================

import { arrowMarkerDefinition } from '@renderer/common/styling'
import type { IUiJsonDiscreteInput } from '@renderer/libopencor/locUIJsonApi'

import { getSvgFillStyle, getSvgPathStyle, setSvgPathStyle, type IPathStyle } from '@renderer/common/svgUtils'

import { alert } from '@editor/editor/alerts'
import {
    CellDLComponent,
    type CellDLConnection,
    type CellDLObject
} from '@editor/celldlObjects'
import type {
    ComponentLibrary,
    ElementTypeName,
    ObjectTemplate
} from '@editor/components'
import {
    getItemProperty,
    type ItemDetails,
    type PropertyGroup,
    type StyleObject,
    STYLING_GROUP_ID,
    updateItemProperty,
    type ValueChange
} from '@editor/components/properties'
import * as $rdf from '@renderer/metadata'
import { BGF, RDF, SPARQL_PREFIXES } from '@renderer/metadata'
import { type MetadataProperty, MetadataPropertiesMap } from '@renderer/metadata'
import type { ConnectionStatus, PluginInterface } from '@renderer/plugins'

import {
    BONDGRAPH_COMPONENT_DEFINITIONS,
    DEFAULT_LOCATION,
    DEFAULT_SPECIES,
    definitionToLibraryTemplate,
    svgImage
} from './definitions'
import type {
    BGComponentLibrary,
    BGLibraryComponentTemplate,
    BGElementStyle
} from './utils'

//==============================================================================

export const BONDGRAPH_PLUGIN_ID = 'bondgraph-components'

const BONDGRAPH_FRAMEWORK = 'https://bg-rdf.org/ontologies/bondgraph-framework'

//==============================================================================

const BGF_ONTOLOGY_URI = 'https://bg-rdf.org/ontologies/bondgraph-framework'

const BG_RDF_TEMPLATE_BASE_URI = 'https://bg-rdf.org/'

const BG_RDF_TEMPLATE_URIS = [
    `${BG_RDF_TEMPLATE_BASE_URI}templates/chemical.ttl`,
    `${BG_RDF_TEMPLATE_BASE_URI}templates/electrical.ttl`,
    `${BG_RDF_TEMPLATE_BASE_URI}templates/hydraulic.ttl`,
    `${BG_RDF_TEMPLATE_BASE_URI}templates/mechanical.ttl`
]

const BG_RDF_SOURCES: Map<string, string> = new Map()

const BG_RDF_ASSET_BASE = '/src/assets/bg-rdf/'

const BG_RDF_ONTOLOGY_ASSET_PATH = `${BG_RDF_ASSET_BASE}ontology.ttl`

// See https://vite.dev/guide/features#custom-queries

// N.B. The path to `glob()` must be a literal, not a computed constant

const BG_RDF_ONTOLOGY_SOURCE: Record<string, string> = import.meta.glob('@renderer/assets/bg-rdf/ontology.ttl', {
    eager: true,
    import: 'default',
    query: '?raw'
})

for (const [path, data] of Object.entries(BG_RDF_ONTOLOGY_SOURCE)) {
    if (path.endsWith(BG_RDF_ONTOLOGY_ASSET_PATH)) {
        BG_RDF_SOURCES.set(BGF_ONTOLOGY_URI, data)
        break
    }
}

// N.B. The path to `glob()` must be a literal, not a computed constant

const BG_RDF_TEMPLATE_SOURCES: Record<string, string> = import.meta.glob('@renderer/assets/bg-rdf/templates/*.ttl', {
    eager: true,
    import: 'default',
    query: '?raw'
})

for (const [path, data] of Object.entries(BG_RDF_TEMPLATE_SOURCES)) {
    for (const templateUri of BG_RDF_TEMPLATE_URIS) {
        const templatePath = templateUri.substring(BG_RDF_TEMPLATE_BASE_URI.length)
        const templateKey = `${BG_RDF_ASSET_BASE}${templatePath}`
        if (path.endsWith(templateKey)) {
            BG_RDF_SOURCES.set(templateUri, data)
            break
        }
    }
}

//==============================================================================

export class BGBaseComponent {
    #name: string|undefined
    #nodeType: string
    #numPorts: number
    #style: BGElementStyle
    #symbol: string
    #type: string

    constructor(template: BGLibraryComponentTemplate, name: string, nodeType: string) {
        this.#name = name
        this.#nodeType = nodeType
        this.#symbol = template.symbol
        this.#style = template.style
        this.#type = template.type
        this.#numPorts = template.numPorts
    }

    get isBondElement() {
        return this.#nodeType === BGF.uri('BondElement').value
    }

    get isJunctionStructure() {
        return this.#nodeType === BGF.uri('JunctionStructure').value
    }

    get name() {
        return this.#name
    }

    get numPorts() {
        return this.#numPorts
    }

    get style() {
        return this.#style
    }

    get symbol() {
        return this.#symbol
    }

    get type() {
        return this.#type
    }
}

//==============================================================================

interface Variable {
    name: string
    units: string
    value?: string
}

type IdVariableMap = Map<string, Variable>

//==============================================================================

interface PhysicalDomain {
    id: string
    flow: Variable
    potential: Variable
    quantity: Variable
}

//==============================================================================

type ElementTemplate = ElementTypeName & {
    domain: string
    units?: string
    value?: Variable
    parameters: IdVariableMap
    variables: IdVariableMap
    symbol: string
    defaultStyle: BGElementStyle
    baseComponentType: string
}

//==============================================================================

interface PluginData {
    baseComponentType: string
    elementTemplate?: ElementTemplate
    fillColours?: string[]
    symbol?: string
    location?: string
    species?: string
}

//==============================================================================

enum BG_INPUT {
    ElementType = 'bg-element-type',
    ElementSpecies = 'bg-species',
    ElementLocation = 'bg-location',
    ElementValue = 'bg-element-value'
}

enum BG_GROUP {
    ElementGroup = 'bg-element-group',
    ParameterGroup = 'bg-parameter-group',
    VariableGroup = 'bg-variable-group'
}

function PROPERTY_GROUPS(): PropertyGroup[] {
    return [
        {
            groupId: BG_GROUP.ElementGroup,
            title: 'Element',
            items: [
                {
                    itemId: BG_INPUT.ElementType,
                    property: RDF.uri('type').value,
                    name: 'Bond Element',
                    possibleValues: [],
                    optional: true
                },
                {
                    itemId: BG_INPUT.ElementSpecies,
                    property: BGF.uri('hasSpecies').value,
                    name: 'Species',
                    defaultValue: ''
                },
                {
                    itemId: BG_INPUT.ElementLocation,
                    property: BGF.uri('hasLocation').value,
                    name: 'Location',
                    defaultValue: ''
                },
                // @ts-expect-error:
                {
                    itemId: BG_INPUT.ElementValue,
                    property: BGF.uri('hasValue').value,
                    name: 'Initial value',
                    defaultValue: 0,
                    numeric: true,
                    optional: true
                }
            ]
        },
        {
            groupId: BG_GROUP.ParameterGroup,
            title: 'Parameters',
            items: []
        },
        {
            groupId: BG_GROUP.VariableGroup,
            title: 'Variables',
            items: []
        }
    ]
}

const ELEMENT_GROUP_INDEX = 0
const PARAMS_GROUP_INDEX = 1
const VARS_GROUP_INDEX = 2

// Within ELEMENT_GROUP
const ELEMENT_VALUE_INDEX = 3

//==============================================================================

export class BondgraphPlugin implements PluginInterface {
    readonly id: string = BONDGRAPH_PLUGIN_ID

    #baseComponents: Map<string, BGBaseComponent> = new Map()                       // Indexed by component.type
    #baseComponentToElementTemplates: Map<string, ElementTemplate[]> = new Map()    // Indexed by component.type
    #elementTemplates: Map<string, ElementTemplate> = new Map()                     // Indexed by element.type
    #propertyGroups: PropertyGroup[]

    #componentLibrary: BGComponentLibrary = {
        id: this.id,
        name: 'Bondgraph Elements',
        templates: BONDGRAPH_COMPONENT_DEFINITIONS.map(defn => definitionToLibraryTemplate(defn))
    }
    #bondgraph_component_templates: Map<string, BGLibraryComponentTemplate> = new Map(
        this.#componentLibrary.templates.map((c: BGLibraryComponentTemplate) => [c.id, c])
    )

    #currentDocumentUri: string = ''
    #physicalDomains: Map<string, PhysicalDomain> = new Map()
    #rdfStore: $rdf.RdfStore = new $rdf.RdfStore()

    constructor() {
        this.#propertyGroups = PROPERTY_GROUPS()
        for (const [uri, source] of BG_RDF_SOURCES.entries()) {
            this.#rdfStore.load(uri, source)
        }
        this.#loadDomains()
        this.#loadBaseComponents()
        this.#assignTemplates()
        this.#loadTemplateParameters()
    }

    rdfStatements(): $rdf.Statement[] {
        return this.#rdfStore.statements()
    }

    //==========================================================================

    get componentLibrary(): ComponentLibrary {
        return this.#componentLibrary
    }

    #getName(type: string): string {
        if (this.#elementTemplates.has(type)) {
            return this.#elementTemplates.get(type)!.name
        }
        if (this.#baseComponents.has(type)) {
            return this.#baseComponents.get(type)!.name || ''
        }
        return ''
    }

    getPluginData(celldlObject: CellDLObject, rdfStore: $rdf.RdfStore): object {
        if (celldlObject.isConnection) {
            return {
                baseComponent: {}
            }
        }
        const rows = rdfStore.query(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            SELECT ?type ?symbol WHERE {
                ${celldlObject.uri.toString()} a ?type
                OPTIONAL { ${celldlObject.uri.toString()} bgf:hasSymbol ?symbol }
            }`
        )
        let pluginData: PluginData|undefined
        for (const r of rows) {
            const rdfType = r.get('type')!.value
            const symbol = r.get('symbol')
            const baseComponent = this.#baseComponents.get(rdfType)
            if (baseComponent) {
                pluginData = { baseComponentType: rdfType } as PluginData
            } else if (this.#elementTemplates.has(rdfType)) {
                const elementTemplate = this.#elementTemplates.get(rdfType)!
                if (pluginData) {
                    pluginData.elementTemplate = elementTemplate
                } else {
                    pluginData = {
                        baseComponentType: elementTemplate.baseComponentType,
                        elementTemplate: elementTemplate
                    }
                }
            }
            if (symbol && pluginData) {
                pluginData.symbol = symbol.value
            }
        }
        return pluginData || {}
    }

    getTemplateName(rdfType: string): string|undefined {
        const elementTemplate = this.#elementTemplates.get(rdfType)
        if (elementTemplate) {
            return elementTemplate.name
        }
        const baseComponent = this.#baseComponents.get(rdfType)
        if (baseComponent) {
            return baseComponent.name
        }
    }

    getObjectTemplateById(id: string): ObjectTemplate|undefined {
        const componentTemplate = this.#bondgraph_component_templates.get(id)
        if (componentTemplate) {
            const metadataProperties: MetadataProperty[] = [
                [ RDF.uri('type'), $rdf.namedNode(componentTemplate.type)],
                [ BGF.uri('hasSymbol'), $rdf.literal(componentTemplate.symbol)]
            ]
            if (!componentTemplate.noSpeciesLocation) {
                metadataProperties.push(
                    [ BGF.uri('hasSpecies'), $rdf.literal(DEFAULT_SPECIES)],
                    [ BGF.uri('hasLocation'), $rdf.literal(DEFAULT_LOCATION)]
                )
            }
            return {
                CellDLClass: CellDLComponent,
                image: componentTemplate.image,
                metadataProperties: MetadataPropertiesMap.fromProperties(metadataProperties),
                name: this.#getName(componentTemplate.type)
            }
        }
    }

    //======================================

    getPropertyGroups(): PropertyGroup[] {
        return this.#propertyGroups
    }

    //==========================================================================

    newDocument(uri: string, rdfStore: $rdf.RdfStore) {
        // We are creating a BondgraphModel

        rdfStore.add($rdf.namedNode(uri), RDF.uri('type'), BGF.uri('BondgraphModel'))
        this.#currentDocumentUri = uri

        // Add a copy of the BG-RDF framework as a named graph, to use later when
        // finding BondElements and JunctionStructures

        const bgfGraph = $rdf.namedNode(BONDGRAPH_FRAMEWORK)
        for (const statement of this.#rdfStore.statements()) {
            rdfStore.add(statement.subject, statement.predicate, statement.object, bgfGraph)
        }
    }

    //======================================

    addDocumentMetadataToStore(rdfStore: $rdf.RdfStore) {
        // First remove existing statements about components in the document

        rdfStore.update(`${SPARQL_PREFIXES}
            DELETE {
                <${this.#currentDocumentUri}> bgf:hasBondElement ?uri
            }
            WHERE {
                <${this.#currentDocumentUri}> bgf:hasBondElement ?uri
            }`)
        rdfStore.update(`${SPARQL_PREFIXES}
            DELETE {
                <${this.#currentDocumentUri}> bgf:hasJunctionStructure ?uri
            }
            WHERE {
                <${this.#currentDocumentUri}> bgf:hasJunctionStructure ?uri
            }`)

        const statements: string[] = []

        // Find the BondElements in the diagram

        rdfStore.query(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>
            SELECT ?uri
            WHERE {
                ?uri a ?type .
                ?type rdfs:subClassOf* bgf:BondElement
            }`, true)
        .forEach((r) => {
            statements.push(`<${this.#currentDocumentUri}> bgf:hasBondElement ${r.get('uri')!.toString()} .`)
        })

        // Find the JunctionStructures in the diagram

        rdfStore.query(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            SELECT ?uri
            WHERE {
                ?uri a ?type .
                ?type rdfs:subClassOf* bgf:JunctionStructure
            }`, true)
        .forEach((r) => {
            statements.push(`<${this.#currentDocumentUri}> bgf:hasJunctionStructure ${r.get('uri')!.toString()} .`)
        })

        // And add them to the BondgraphModel

        rdfStore.update(`${SPARQL_PREFIXES}
            INSERT DATA {
                ${statements.join('\n')}
            }
        `)
    }

    //==========================================================================

    addNewConnection(connection: CellDLConnection, rdfStore: $rdf.RdfStore) {
        const uri = connection.uri.toString()
        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            INSERT DATA {
                ${uri} bgf:hasSource ${connection.source!.uri.toString()} .
                ${uri} bgf:hasTarget ${connection.target!.uri.toString()} .
            }
        `)
    }

    checkConnectionValid(startObject: CellDLObject, endObject: CellDLObject): ConnectionStatus|undefined {
        const startTemplate = (<PluginData>startObject.pluginData(this.id)).elementTemplate
        const endTemplate = (<PluginData>endObject.pluginData(this.id)).elementTemplate
        if (startTemplate?.domain && endTemplate?.domain
         && startTemplate.domain !== endTemplate.domain) {
            return {
                alert: `Cannot connect ${$rdf.fragment(startTemplate.domain)} and ${$rdf.fragment(endTemplate.domain)} physical domains`
            }
        }
        return {
            domain: startTemplate?.domain || endTemplate?.domain
        }
    }

    deleteConnection(connection: CellDLConnection, rdfStore: $rdf.RdfStore) {
        const uri = connection.uri.toString()
        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            DELETE DATA {
                ${uri} bgf:hasSource ${connection.source!.uri.toString()} .
                ${uri} bgf:hasTarget ${connection.target!.uri.toString()} .
            }
        `)
    }

    getMaxConnections(celldlObject: CellDLObject): number {
        const pluginData = (<PluginData>celldlObject.pluginData(this.id))
        const baseComponent = this.#baseComponents.get(pluginData.baseComponentType)
        return baseComponent ? baseComponent.numPorts : Infinity
    }

    //==========================================================================

    updateComponentProperties(celldlObject: CellDLObject, componentProperties: PropertyGroup[], rdfStore: $rdf.RdfStore) {
        alert.clear()
        if (celldlObject.isConnection) {
            componentProperties.forEach(group => {
                if (group.groupId === STYLING_GROUP_ID) {
                    this.#loadElementStyling(celldlObject, group, true)
                }
            })
        } else {
            const pluginData = (<PluginData>celldlObject.pluginData(this.id))
            componentProperties.forEach(group => {
                if (group.groupId === BG_GROUP.ElementGroup) {
                    this.#getElementProperties(celldlObject, group, rdfStore)
                } else if (pluginData.elementTemplate) {
                    if (group.groupId === BG_GROUP.ParameterGroup) {
                        this.#setVariableTemplates(pluginData.elementTemplate.parameters, group)
                        this.#loadVariableProperties(celldlObject, group, rdfStore)
                    } else if (group.groupId === BG_GROUP.VariableGroup) {
                        this.#setVariableTemplates(pluginData.elementTemplate.variables, group)
                        this.#loadVariableProperties(celldlObject, group, rdfStore)
                    }
                } else if (group.groupId === STYLING_GROUP_ID) {
                    this.#loadElementStyling(celldlObject, group, false)
                }
            })
        }
    }

    #getElementProperties(celldlObject: CellDLObject,
                          group: PropertyGroup, rdfStore: $rdf.RdfStore) {
        const propertyTemplates = this.#propertyGroups[ELEMENT_GROUP_INDEX]!
        const pluginData = <PluginData>celldlObject.pluginData(this.id)
        const elementTemplate = pluginData.elementTemplate
        propertyTemplates.items.forEach((itemTemplate: ItemDetails) => {
            const items: ItemDetails[] = []
            if (itemTemplate.itemId === BG_INPUT.ElementType) {
                const discreteItem = this.#getElementTypeItem(itemTemplate, pluginData)
                if (discreteItem) {
                    items.push(discreteItem)
                }
            } else if (itemTemplate.itemId === BG_INPUT.ElementSpecies ||
                       itemTemplate.itemId === BG_INPUT.ElementLocation ||
                       itemTemplate.itemId === BG_INPUT.ElementValue) {
                let item = getItemProperty(celldlObject, itemTemplate, rdfStore)
                if (!item
                 && itemTemplate.itemId === BG_INPUT.ElementValue
                 && elementTemplate && elementTemplate.value) {
                    item = {...itemTemplate, units: elementTemplate.value.units}
                }
                if (item) {
                    if (itemTemplate.itemId === BG_INPUT.ElementSpecies) {
                        pluginData.species = String(item.value)
                    }
                    if (itemTemplate.itemId === BG_INPUT.ElementLocation) {
                        pluginData.location = String(item.value)
                    }
                    if (itemTemplate.itemId === BG_INPUT.ElementValue) {
                        item.optional = false
                    }
                    items.push(item)
                }
            }
            group.items.push(...items)
        })
    }

    #loadElementStyling(celldlObject: CellDLObject, group: PropertyGroup, connection: boolean) {
        if (connection) {
            group.styling = {
                pathStyle: getSvgPathStyle(celldlObject.celldlSvgElement!.svgElement)
            }
        } else {
            const pluginData = (<PluginData>celldlObject.pluginData(this.id))
            if (!('fillColours' in pluginData)) {
                pluginData.fillColours = getSvgFillStyle(celldlObject.celldlSvgElement!.svgElement.outerHTML)
            }
            group.styling = {
                fillColours: pluginData.fillColours || []
            }
        }
    }

    #loadVariableProperties(celldlObject: CellDLObject, group: PropertyGroup, rdfStore: $rdf.RdfStore) {
        const objectUri = celldlObject.uri.toString()

        const values: Map<string, string> = new Map()
        rdfStore.query(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            SELECT ?name ?value
            WHERE {
                ${objectUri} bgf:parameterValue [
                    bgf:varName ?name ;
                    bgf:hasValue ?value
                ]
            }`
        ).forEach((r) => {
            values.set(r.get('name')!.value, r.get('value')!.value)
        })

        group.items.forEach(item => {
            const itemVariable = item.itemId.split('/')
            const varName = itemVariable[1]!
            if (values.has(varName)) {
                const valueUnits = values.get(varName)!.split(' ')
                item.value = valueUnits[0]
                item.units = valueUnits[1]
            }
        })
    }

    //==========================================================================

    #deleteElementValue(celldlObject: CellDLObject, rdfStore: $rdf.RdfStore) {
        const item = this.#propertyGroups[ELEMENT_GROUP_INDEX]!.items[ELEMENT_VALUE_INDEX]!
        updateItemProperty(item.property, { newValue: '', oldValue: ''}, celldlObject, rdfStore)
    }

    #setElementValueTemplate(variable: Variable|undefined, group: PropertyGroup) {
        const haveVarItem = (group.items.length > ELEMENT_VALUE_INDEX)

        const itemDefn = this.#propertyGroups[ELEMENT_GROUP_INDEX]!.items[ELEMENT_VALUE_INDEX]!
        if (haveVarItem) {
            const item = group.items[ELEMENT_VALUE_INDEX]!
            if (variable) {
                item.name = `${itemDefn.name} (${variable.units})`
                item.optional = false
            } else {
                item.optional = false
                item.value = ''
            }
        } else if (variable) {
            group.items.push(Object.assign({}, itemDefn, {
                name: `${itemDefn.name} (${variable.units})`,
                optional: false
            }))
        }
    }

    #setVariableTemplates(variables: IdVariableMap, group: PropertyGroup, reset: boolean=false) {
        if (reset) {
            group.items.length = 0
        }
        if (group.items.length === 0) {
            for (const variable of variables.values()) {
                // @ts-expect-error: WIP
                group.items.push({
                    itemId: `${group.groupId}/${variable.name}`,
                    property: BGF.uri('parameterValue').value,
                    name: variable.name,
                    units: variable.units,
                    minimumValue: 0,
                    defaultValue: 0,
                    numeric: true
                })
            }
        }
    }

    //==========================================================================
    //==========================================================================

    #printObjectProperties(celldlObject: CellDLObject, rdfStore: $rdf.RdfStore) {
        const objectUri = celldlObject.uri.toString()

        rdfStore.query(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            SELECT ?p ?o WHERE {
                ${objectUri} ?p ?o
            }`).forEach((r) => {
            console.log(celldlObject.id, r.get('p')!.value, r.get('o')!.value)
        })
    }

    //==========================================================================
    //==========================================================================

    async updateObjectProperties(celldlObject: CellDLObject, itemId: string, value: ValueChange,
                                    componentProperties: PropertyGroup[], rdfStore: $rdf.RdfStore) {
        await this.#updateElementProperties(value, itemId, celldlObject, rdfStore)

        const elementTemplate = (<PluginData>celldlObject.pluginData(this.id)).elementTemplate
        if (elementTemplate) {
            if (itemId === BG_INPUT.ElementType && value.newValue !== value.oldValue) {
                this.#setElementValueTemplate(elementTemplate.value,
                                              componentProperties[ELEMENT_GROUP_INDEX]!)
                if (!elementTemplate.value) {
                    this.#deleteElementValue(celldlObject, rdfStore)
                }
                this.#setVariableTemplates(elementTemplate.parameters,
                                           componentProperties[PARAMS_GROUP_INDEX]!, true)
                this.#setVariableTemplates(elementTemplate.variables,
                                           componentProperties[VARS_GROUP_INDEX]!, true)
            }
            this.#updateVariableProperties(value, itemId, celldlObject, elementTemplate, rdfStore)
        }
    }

    //==================================

    async updateComponentStyling(celldlObject: CellDLObject, objectType: string, styling: StyleObject) {
        const pluginData = (<PluginData>celldlObject.pluginData(this.id))
        if (objectType === 'node' && 'fillColours' in styling) {
            const fillColours = styling.fillColours as string[] || []
            if (fillColours.toString() !== pluginData.fillColours!.toString()) {
                pluginData.fillColours = [...fillColours]
                await this.#updateSvgElement(celldlObject, pluginData.species, pluginData.location)
            }
        } else if (objectType === 'path' && 'pathStyle' in styling) {
            setSvgPathStyle(celldlObject.celldlSvgElement!.svgElement, styling.pathStyle as IPathStyle)
        }
    }

    //==================================

    async #updateElementProperties(value: ValueChange, itemId: string,
                             celldlObject: CellDLObject, rdfStore: $rdf.RdfStore) {
        const propertyTemplates = this.#propertyGroups[ELEMENT_GROUP_INDEX]!
        const pluginData = (<PluginData>celldlObject.pluginData(this.id))

        for (const item of propertyTemplates.items) {
            if (itemId === item.itemId) {
                alert.clear()
                if (itemId === BG_INPUT.ElementType) {
                    await this.#updateElementType(item, value, celldlObject, rdfStore)
                } else if (itemId === BG_INPUT.ElementSpecies) {
                    const errorMsg = await this.#updateSvgElement(celldlObject, value.newValue, pluginData.location)
                    if (errorMsg === '') {
                        updateItemProperty(item.property, value, celldlObject, rdfStore)
                        pluginData.species = value.newValue
                    } else {
                        alert.error(errorMsg)
                    }
                } else if (itemId === BG_INPUT.ElementLocation) {
                    pluginData.location = value.newValue
                    const errorMsg = await this.#updateSvgElement(celldlObject, pluginData.species, value.newValue)
                    if (errorMsg === '') {
                        updateItemProperty(item.property, value, celldlObject, rdfStore)
                        pluginData.location = value.newValue
                    } else {
                        alert.error(errorMsg)
                    }
                } else if (itemId === BG_INPUT.ElementValue) {
                    this.#updateElementValue(value, celldlObject, rdfStore)
                }
                break
            }
        }
    }

    //==================================

    #updateElementValue(value: ValueChange, celldlObject: CellDLObject, rdfStore: $rdf.RdfStore) {
        const objectUri = celldlObject.uri.toString()

        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            DELETE {
                ${objectUri} bgf:hasValue ?value
            }
            WHERE {
                ${objectUri} bgf:hasValue ?value
            }`)
        const newValue = String(value.newValue).trim()
        const elementTemplate = (<PluginData>celldlObject.pluginData(this.id)).elementTemplate
        const variable = elementTemplate!.value
        if (newValue) {
            rdfStore.update(`${SPARQL_PREFIXES}
                PREFIX : <${this.#currentDocumentUri}#>

                INSERT DATA {
                   ${objectUri} bgf:hasValue "${newValue} ${variable!.units}"^^cdt:ucum .
                }
            `)
        }
    }

    //==================================

    #updateVariableProperties(value: ValueChange, itemId: string, celldlObject: CellDLObject,
                              elementTemplate: ElementTemplate, rdfStore: $rdf.RdfStore) {
        const itemVariable = itemId.split('/')
        if (itemVariable.length !== 2) {
            return
        }
        itemId = itemVariable[0]!
        if (itemId !== BG_GROUP.ParameterGroup && itemId === BG_GROUP.VariableGroup) {
            return
        }
        const varName = itemVariable[1]!
        const objectUri = celldlObject.uri.toString()
        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            DELETE WHERE {
                ${objectUri} bgf:parameterValue ?pv .
                ?pv bgf:varName "${varName}" ;
                    bgf:hasValue ?value .
            }`)
        const variable = (itemId === BG_GROUP.ParameterGroup)
                       ? elementTemplate.parameters.get(varName)
                       : elementTemplate.variables.get(varName)
        if (!variable) {
            return
        }
        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>

            INSERT DATA {
                ${objectUri} bgf:parameterValue _:pv .
                _:pv bgf:varName "${varName}" ;
                     bgf:hasValue "${value.newValue} ${variable.units}"^^cdt:ucum .
            }
        `)
// Check units...
//            ucum.isConvertible(units1: string, units2: string)
    }

    //==================================

    async #updateSvgElement(celldlObject: CellDLObject,
                            species: string|undefined, location: string|undefined): Promise<string> {
        // Update and redraw the component's SVG element

        const pluginData = (<PluginData>celldlObject.pluginData(this.id))
        const baseComponent = this.#baseComponents.get(pluginData.baseComponentType)
        if (!baseComponent) {
            return ''
        }
        const symbol = pluginData?.symbol
                     ?? pluginData.elementTemplate?.symbol
                     ?? baseComponent.symbol
        let svgData = ''
        try {
            svgData = svgImage(symbol, species, location,
                               baseComponent.style, pluginData.fillColours)
        // biome-ignore lint/suspicious/noExplicitAny: <>
        } catch (error: any) {
            return (error as Error).message
        }
        if (svgData) {
            const celldlSvgElement = celldlObject.celldlSvgElement!
            await celldlSvgElement.updateSvgElement(svgData)
            celldlSvgElement.redraw()
        }
        return ''
    }

    //==========================================================================

    styleRules(): string {
        return '.celldl-Connection.bondgraph.arrow { marker-end:url(#connection-end-arrow-bondgraph) }'
    }

    svgDefinitions(): string {
        return arrowMarkerDefinition('connection-end-arrow-bondgraph', 'bondgraph')
    }

    //==========================================================================

    #getElementTypeItem(itemTemplate: ItemDetails, pluginData: PluginData): ItemDetails|undefined {
        const discreteItem = <IUiJsonDiscreteInput>{...itemTemplate}

        discreteItem.possibleValues = []
        const baseComponent = this.#baseComponents.get(pluginData.baseComponentType)
        if (!baseComponent) {
            return
        }
        const elementTemplates = this.#baseComponentToElementTemplates.get(baseComponent.type) || []

        // `baseComponent` and `templates` are possible values
        discreteItem.possibleValues.push({
            name: baseComponent.name || '',
            value: baseComponent.type,
            emphasise: true
        })
        discreteItem.possibleValues.push(
            ...elementTemplates.map(t => {
                return {
                    name: t.name,
                    value: t.type
                }
            })
        )

        const discreteValue = pluginData.elementTemplate
                            ? pluginData.elementTemplate.type
                            : baseComponent.type
        const index = discreteItem.possibleValues.findIndex(v => String(discreteValue) === String(v.value))
        if (index >= 0) {
            discreteItem.value = discreteItem.possibleValues[index]
        }

        return discreteItem as ItemDetails
    }

    //==========================================================================

    async #updateElementType(_itemTemplate: ItemDetails, value: ValueChange,
                       celldlObject: CellDLObject, rdfStore: $rdf.RdfStore) {
        const objectUri = celldlObject.uri.toString()
        const pluginData = (<PluginData>celldlObject.pluginData(this.id))
        const baseComponent = this.#baseComponents.get(pluginData.baseComponentType)!

        const deleteTriples: string[] = []
        if (this.#elementTemplates.has(value.oldValue)) {
            deleteTriples.push(`${objectUri} a <${value.oldValue}>`)
            deleteTriples.push(`${objectUri} a <${baseComponent.type}>`)
            delete pluginData.elementTemplate
        } else if (this.#baseComponents.has(value.oldValue)) {
            deleteTriples.push(`${objectUri} a <${value.oldValue}>`)
        }
        const oldSymbol = pluginData.symbol
        if (oldSymbol) {
            deleteTriples.push(`${objectUri} bgf:hasSymbol "${oldSymbol}"`)
        }
        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>
            DELETE DATA {
                ${deleteTriples.join('\n')}
            }`)

        rdfStore.update(`${SPARQL_PREFIXES}
            PREFIX : <${this.#currentDocumentUri}#>
            INSERT DATA { ${objectUri} a <${value.newValue}> }
        `)
        let newSymbol: string|undefined
        if (this.#elementTemplates.has(value.newValue)) {
            pluginData.elementTemplate = this.#elementTemplates.get(value.newValue)!
            newSymbol = pluginData.elementTemplate.symbol
        }
        if (newSymbol === undefined) {
            newSymbol = baseComponent.symbol
        }
        if (newSymbol) {
            pluginData.symbol = newSymbol
            rdfStore.update(`${SPARQL_PREFIXES}
                PREFIX : <${this.#currentDocumentUri}#>
                INSERT DATA { ${objectUri} bgf:hasSymbol "${newSymbol}" }
            `)
            await this.#updateSvgElement(celldlObject, pluginData.species, pluginData.location)
        }
        celldlObject.setName(this.#getName(value.newValue))
    }

    //==========================================================================
    //==========================================================================

    #query(sparql: string) {
        return this.#rdfStore.query(`${SPARQL_PREFIXES}${sparql}`)
    }

    #loadDomains() {
        this.#query(`
            SELECT ?domain
                ?flowName ?flowUnits
                ?potentialName ?potentialUnits
                ?quantityName ?quantityUnits
            WHERE {
              ?domain a bgf:PhysicalDomain ;
                bgf:hasFlow [
                    bgf:varName ?flowName ;
                    bgf:hasUnits ?flowUnits
                ] ;
                bgf:hasPotential [
                    bgf:varName ?potentialName ;
                    bgf:hasUnits ?potentialUnits
                ] ;
                bgf:hasQuantity [
                    bgf:varName ?quantityName ;
                    bgf:hasUnits ?quantityUnits
                ] .
            }`
        ).forEach((r) => {
            const domain = r.get('domain')!
            this.#physicalDomains.set(domain.value, {
                id: domain.value,
                flow: {
                    name: r.get('flowName')!.value,
                    units: r.get('flowUnits')!.value,
                },
                potential: {
                    name: r.get('potentialName')!.value,
                    units: r.get('potentialUnits')!.value,
                },
                quantity: {
                    name: r.get('quantityName')!.value,
                    units: r.get('quantityUnits')!.value,
                },
            })
        })
    }

    #loadBaseComponents() {
        // Get information about the components in the add component tool
        this.#query(`
            SELECT ?element ?label ?base WHERE {
                ?element rdfs:subClassOf ?base .
                OPTIONAL { ?element rdfs:label ?label }
                { ?base rdfs:subClassOf* bg:BondElement }
            UNION
                { ?base rdfs:subClassOf* bg:JunctionStructure }
            }`
        ).forEach((r) => {
            const element = r.get('element')!
            const label = r.get('label')
            const base = r.get('base')!
            for (const componentTemplate of this.#bondgraph_component_templates.values()) {
                if (componentTemplate.type === element.value) {
                    let component = this.#baseComponents.get(componentTemplate.type)
                    if (!component) {
                        if (label) {    // Ontology labels override component names
                            componentTemplate.name = label.value
                        }
                        component = new BGBaseComponent(componentTemplate,
                                        base.value)
                                        label ? label.value : $rdf.getCurie(element.value),
                        this.#baseComponents.set(componentTemplate.type, component)
                    }
                    componentTemplate.component = component
                }
            }
        })
    }

    #getDiffVariable(domain: PhysicalDomain, relation: string): Variable|undefined {
        relation = relation.replace(/\n \s*/g, '')  // Remove blanks and new lines
        const diffStateVar = relation.match(/<apply><diff\/><bvar><ci>[^<]*<\/ci><\/bvar><ci>([^<]*)<\/ci><\/apply>/)
        if (diffStateVar) {
            const symbol = diffStateVar[1]
            if (symbol === domain.quantity.name) {
                return domain.quantity
            } else if (symbol === domain.flow.name) {
                return domain.flow
            } else if (symbol === domain.potential.name) {
                return domain.potential
            }
        }
    }

    #assignTemplates() {
        for (const [base, component] of this.#baseComponents.entries()) {
            this.#query(`
                SELECT ?element ?label ?symbol ?domain ?relation WHERE {
                    ?element
                        rdfs:subClassOf* ?subType ;
                        rdfs:subClassOf* <${base}> .
                    ?subType bgf:hasDomain ?domain .
                    OPTIONAL { ?element rdfs:label ?label }
                    OPTIONAL { ?element bgf:hasSymbol ?symbol }
                    OPTIONAL { ?subType bgf:constitutiveRelation ?relation }
                    FILTER (
                        exists { ?element a bgf:ElementTemplate }
                     || exists {<${base}> a bgf:CompositeElement}
                    )
                  } order by ?label`
            ).forEach((r) => {
                const element = r.get('element')!
                const domainId = r.get('domain')!.value
                const label = r.get('label')
                const symbol = r.get('symbol')
                if (!this.#baseComponentToElementTemplates.has(component.type)) {
                    this.#baseComponentToElementTemplates.set(component.type, [])
                }
                const elementTemplate: ElementTemplate = {
                    type: element.value,
                    domain: domainId,
                    name: label ? label.value : $rdf.getCurie(element.value),
                    parameters: new Map(),
                    variables: new Map(),
                    defaultStyle: component.style,
                    symbol: symbol ? symbol.value : component.symbol,
                    baseComponentType: component.type,
                }
                const domain = this.#physicalDomains.get(domainId)
                if (domain) {
                    if (component.type === BGF.uri('PotentialSource').value) {
                        elementTemplate.value = domain.potential
                        elementTemplate.units = domain.potential.units
                    } else if (component.type === BGF.uri('FlowSource').value) {
                        elementTemplate.value = domain.flow
                        elementTemplate.units = domain.flow.units
                    } else if (component.type === BGF.uri('Reaction').value
                            || component.type === BGF.uri('Resistance').value) {
                        elementTemplate.units = domain.flow.units
                    } else {
                        const relation = r.get('relation')
                        if (relation) {
                            const differentiatedVariable = this.#getDiffVariable(domain, relation.value)
                            if (differentiatedVariable) {
                                elementTemplate.value = differentiatedVariable
                                elementTemplate.units = differentiatedVariable.units
                            }
                        }
                    }
                }
                this.#elementTemplates.set(elementTemplate.type, elementTemplate)
                this.#baseComponentToElementTemplates.get(component.type)!.push(elementTemplate)
            })
        }
    }

    #saveParametersAndStates(r: Map<string, $rdf.Term>) {
        const element = r.get('element')!
        const template = this.#elementTemplates.get(element.value)
        if (!template) return ;
        if (r.has('parameterName')) {
            const name = r.get('parameterName')!.value
            template.parameters.set(name, {
                name: name,
                units: r.get('parameterUnits')!.value
            })
        }
        if (r.has('variableName')) {
            const name = r.get('variableName')!.value
            template.variables.set(name, {
                name: name,
                units: r.get('variableUnits')!.value
            })
        }
    }

    #loadTemplateParameters() {
        // Find parameters and variables for Element templates
        this.#query(`
            SELECT ?element ?parameterName ?parameterUnits
                            ?variableName ?variableUnits
            WHERE {
                ?element a bgf:ElementTemplate .
                {
                    ?element bgf:hasParameter [
                        bgf:varName ?parameterName ;
                        bgf:hasUnits ?parameterUnits
                    ]
                }
                UNION
                {
                    ?element bgf:hasVariable [
                        bgf:varName ?variableName ;
                        bgf:hasUnits ?variableUnits
                    ]
                }
            } ORDER BY ?element ?parameterName ?variableName`
        ).forEach((r) => {
            this.#saveParametersAndStates(r)
        })
        // Find parameters and variables for Composite templates
        this.#query(`
            SELECT ?element ?parameterName ?parameterUnits
                            ?variableName ?variableUnits
            WHERE {
                ?element a bgf:CompositeTemplate ;
                    rdfs:subClassOf ?base .
                ?base a bgf:ElementTemplate .
                {
                    ?base bgf:hasParameter [
                        bgf:varName ?parameterName ;
                        bgf:hasUnits ?parameterUnits
                    ]
                }
                UNION
                {
                    ?base bgf:hasVariable [
                        bgf:varName ?variableName ;
                        bgf:hasUnits ?variableUnits
                    ]
                }
            } ORDER BY ?element ?parameterName ?variableName`
        ).forEach((r) => {
            this.#saveParametersAndStates(r)
        })
    }
}

//==============================================================================
//==============================================================================
