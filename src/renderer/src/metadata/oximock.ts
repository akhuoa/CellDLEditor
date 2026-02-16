/******************************************************************************

CellDL Editor

Copyright (c) 2022 - 2026 David Brooks

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

import * as $rdf from '.'

//==============================================================================

type LiteralOptions = {
    datatype?: $rdf.NamedNode|undefined
}

/**
 * Expose our RDF code as a `pyodide` JS module, to register as a Python package
 */
export const oximockRdfModule = {
    blankNode: $rdf.blankNode,
    literal: (value: string|number|boolean, options: LiteralOptions={}) => {
        if (options.datatype) {
            return $rdf.literal(value, options.datatype)
        }
        return $rdf.literal(value)
    },
    namedNode: $rdf.namedNode,

    isBlankNode: $rdf.isBlankNode,
    isLiteral: $rdf.isLiteral,
    isNamedNode: $rdf.isNamedNode,

    RdfStore: (): $rdf.RdfStore => new $rdf.RdfStore()
}

//==============================================================================
//==============================================================================
