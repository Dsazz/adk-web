/**
 * @license
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {Component, inject, Input, OnChanges, OnInit, SimpleChanges} from '@angular/core';

import {Span} from '../../../core/models/Trace';
import {TRACE_SERVICE} from '../../../core/services/interfaces/trace';

interface FlatTreeNode {
  span: Span;
  level: number;
  isEventRow: boolean;
  isSelected: boolean;
}

@Component({
  selector: 'app-trace-tree',
  templateUrl: './trace-tree.component.html',
  styleUrl: './trace-tree.component.scss',
})
export class TraceTreeComponent implements OnInit, OnChanges {
  @Input() spans: any[] = [];
  @Input() invocationId: string = '';
  tree: Span[] = [];
  eventData: Map<string, any>|undefined;
  baseStartTimeMs = 0;
  totalDurationMs = 1;
  flatTree: FlatTreeNode[] = [];
  traceLabelIconMap = new Map<string, string>([
    ['Invocation', 'start'],
    // TODO: Remove agent_run mapping once all ADKs span names follow OTLP GenAI semconv.
    ['agent_run', 'robot'],
    ['invoke_agent', 'robot_2'],
    ['tool', 'build'],
    ['execute_tool', 'build'],
    ['call_llm', 'chat'],
  ]);
  selectedRow: Span|undefined = undefined;
  private readonly traceService = inject(TRACE_SERVICE);

  constructor() {}

  ngOnInit(): void {
    this.rebuildTreeState();
    const times = this.getGlobalTimes(this.spans);
    this.baseStartTimeMs = times.start;
    this.totalDurationMs = times.duration;
    this.traceService.selectedTraceRow$.subscribe((span: Span|undefined) => {
      this.selectedRow = span;
      this.refreshSelectionFlags();
    });
    this.traceService.eventData$.subscribe((e: Map<string, any>|undefined) => {
      this.eventData = e;
      this.refreshEventRowFlags();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['spans']) {
      this.rebuildTreeState();
      const times = this.getGlobalTimes(this.spans);
      this.baseStartTimeMs = times.start;
      this.totalDurationMs = times.duration;
    }
  }

  private rebuildTreeState() {
    this.tree = this.buildSpanTree(this.spans);
    this.flatTree = this.flattenTree(this.tree);
    this.refreshSelectionFlags();
    this.refreshEventRowFlags();
  }


  buildSpanTree(spans: Span[]): Span[] {
    const spanClones = spans.map(span => ({...span}));
    const spanMap = new Map<string, Span>();
    const roots: Span[] = [];

    spanClones.forEach(span => spanMap.set(span.span_id, span));
    spanClones.forEach(span => {
      if (span.parent_span_id && spanMap.has(span.parent_span_id)) {
        const parent = spanMap.get(span.parent_span_id)!;
        parent.children = parent.children || [];
        parent.children.push(span);
      } else {
        roots.push(span);
      }
    });

    return roots;
  }

  getGlobalTimes(spans: Span[]) {
    if (!spans || spans.length === 0) {
      return {start: 0, duration: 1};
    }
    const start = Math.min(...spans.map(s => this.toMs(s.start_time)));
    const end = Math.max(...spans.map(s => this.toMs(s.end_time)));
    const duration = end - start;
    return {start, duration: duration > 0 ? duration : 1};
  }

  toMs(nanos: number): number {
    return nanos / 1_000_000;
  }

  getRelativeStart(span: Span): number {
    return ((this.toMs(span.start_time) - this.baseStartTimeMs) /
            this.totalDurationMs) *
        100;
  }

  getRelativeWidth(span: Span): number {
    return ((this.toMs(span.end_time) - this.toMs(span.start_time)) /
            this.totalDurationMs) *
        100;
  }

  flattenTree(spans: Span[], level: number = 0): FlatTreeNode[] {
    const tree = spans.flatMap(
        span =>
            [{span, level, isEventRow: false, isSelected: false},
             ...(span.children ? this.flattenTree(span.children, level + 1) :
                                 [])]);
    return tree
  }

  private isSpanEventRow(span: Span): boolean {
    if (!span.attributes) {
      return false;
    }

    const eventId = span.attributes['gcp.vertex.agent.event_id'];
    return !!(eventId && this.eventData && this.eventData.has(eventId));
  }

  private refreshEventRowFlags() {
    for (const node of this.flatTree) {
      node.isEventRow = this.isSpanEventRow(node.span);
    }
  }

  private refreshSelectionFlags() {
    for (const node of this.flatTree) {
      node.isSelected = !!this.selectedRow &&
          this.selectedRow.span_id === node.span.span_id;
    }
  }

  getSpanIcon(label: string) {
    for (const [key, value] of this.traceLabelIconMap.entries()) {
      if (label.startsWith(key)) {
        return value;
      }
    }
    return 'start';
  }

  getArray(n: number): number[] {
    return Array.from({length: n});
  }

  selectRow(node: any) {
    if (this.selectedRow && this.selectedRow.span_id == node.span.span_id) {
      this.traceService.selectedRow(undefined);
      this.traceService.setHoveredMessages(undefined, this.invocationId)
      return;
    }
    this.traceService.selectedRow(node.span);
    this.traceService.setHoveredMessages(node.span, this.invocationId)
  }

  onHover(n: any) {
    this.traceService.setHoveredMessages(n.span, this.invocationId)
  }

  onHoverOut() {
    this.traceService.setHoveredMessages(undefined, this.invocationId);
    if (this.selectedRow) {
      this.traceService.setHoveredMessages(this.selectedRow, this.invocationId);
    }
  }
}
