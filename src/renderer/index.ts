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

import CellDLEditor from '@renderer/components/WrappedEditor.vue'
import type { ViewState } from '@renderer/common/EditorTypes'

import type * as $rdf from '@renderer/metadata'
import { oximockRdfModule } from '@renderer/metadata/oximock'
import { componentLibraryPlugin } from '@renderer/plugins/index'
import { BONDGRAPH_PLUGIN_ID } from '@renderer/plugins/bondgraph'

//==============================================================================

export { DEFAULT_VIEW_STATE } from '@editor/editor/editguides'
export type { EditorState, ViewState } from '@renderer/common/EditorTypes'

export { version } from './package.json'

//==============================================================================

export type RdfInterface = {
    oximockRdfModule: object
    getRdfStatements: () => $rdf.Statement[]
}

export const rdfInterface: RdfInterface = {
    oximockRdfModule: oximockRdfModule,
    getRdfStatements: () => componentLibraryPlugin.rdfStatements(BONDGRAPH_PLUGIN_ID)
}

//==============================================================================

export type EditorData = {
    data: string
    kind?: string
}

//==============================================================================

export type EditorEditCommand = {
    command: 'edit'
    options: {
        action: string
    }
}

export type EditorExportCommand = {
    command: 'export'
    options: {
        action: string
    }
}

export type EditorFileCommand = {
    command: 'file'
    options: {
        action: string
        data?: string
        kind?: string
        name?: string
    }
}

export type EditorSetStateCommand = {
    command: 'set-state'
    options: {
        action: string
    }
}

export type EditorViewCommand = {
    command: 'view'
    options: ViewState
}

export type CellDLEditorCommand = EditorEditCommand
                                | EditorExportCommand
                                | EditorFileCommand
                                | EditorSetStateCommand
                                | EditorViewCommand

//==============================================================================

export type Theme = 'light' | 'dark' | 'system';

//==============================================================================

export { CellDLEditor }
export default CellDLEditor

export interface CellDLEditorProps {
    editorCommand?: CellDLEditorCommand,
    theme?: Theme
}

//==============================================================================
//==============================================================================
