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

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TraceTreeComponent } from './trace-tree.component';
import { TRACE_SERVICE, TraceService } from '../../../core/services/interfaces/trace';
import { ReplaySubject } from 'rxjs';
import { Span } from '../../../core/models/Trace';

describe('TraceTreeComponent', () => {
  let component: TraceTreeComponent;
  let fixture: ComponentFixture<TraceTreeComponent>;
  let selectedTraceRowSubject: ReplaySubject<Span | undefined>;
  let eventDataSubject: ReplaySubject<Map<string, any> | undefined>;

  beforeEach(async () => {
    selectedTraceRowSubject = new ReplaySubject<Span | undefined>(1);
    selectedTraceRowSubject.next(undefined);
    eventDataSubject = new ReplaySubject<Map<string, any> | undefined>(1);
    eventDataSubject.next(new Map<string, any>());

    const traceService = {
      ...jasmine.createSpyObj<TraceService>([
        'selectedRow',
        'setHoveredMessages',
      ]),
      selectedTraceRow$: selectedTraceRowSubject.asObservable(),
      eventData$: eventDataSubject.asObservable(),
    };

    await TestBed.configureTestingModule({
      imports: [TraceTreeComponent],
      providers: [{ provide: TRACE_SERVICE, useValue: traceService }],
    }).compileComponents();

    fixture = TestBed.createComponent(TraceTreeComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should rebuild flat tree on spans input changes', () => {
    const parentSpan = {
      span_id: 'parent',
      parent_span_id: '',
      name: 'InvocationRoot',
      start_time: 1_000_000,
      end_time: 5_000_000,
      attributes: {},
    } as unknown as Span;
    const childSpan = {
      span_id: 'child',
      parent_span_id: 'parent',
      name: 'toolCall',
      start_time: 2_000_000,
      end_time: 3_000_000,
      attributes: {},
    } as unknown as Span;

    fixture.componentRef.setInput('spans', [childSpan, parentSpan]);
    fixture.detectChanges();

    expect(component.flatTree.length).toBe(2);
    expect(component.flatTree[0].span.span_id).toBe('parent');
    expect(component.flatTree[0].level).toBe(0);
    expect(component.flatTree[1].span.span_id).toBe('child');
    expect(component.flatTree[1].level).toBe(1);
    expect(component.baseStartTimeMs).toBe(1);
    expect(component.totalDurationMs).toBe(4);
  });

  it('should refresh selection and event row flags from trace streams', () => {
    const eventSpan = {
      span_id: 'event-span',
      parent_span_id: '',
      name: 'toolCall',
      start_time: 1_000_000,
      end_time: 2_000_000,
      attributes: {'gcp.vertex.agent.event_id': 'evt-1'},
    } as unknown as Span;
    const regularSpan = {
      span_id: 'regular-span',
      parent_span_id: '',
      name: 'InvocationRoot',
      start_time: 3_000_000,
      end_time: 4_000_000,
      attributes: {},
    } as unknown as Span;
    fixture.componentRef.setInput('spans', [eventSpan, regularSpan]);
    fixture.detectChanges();

    selectedTraceRowSubject.next({span_id: 'regular-span'} as Span);
    eventDataSubject.next(new Map<string, any>([['evt-1', {}]]));
    fixture.detectChanges();

    const eventNode = component.flatTree.find(
        (node) => node.span.span_id === 'event-span');
    const selectedNode = component.flatTree.find(
        (node) => node.span.span_id === 'regular-span');

    expect(eventNode?.isEventRow).toBeTrue();
    expect(selectedNode?.isSelected).toBeTrue();
  });

  it('should keep default global timing for empty span inputs', () => {
    fixture.componentRef.setInput('spans', []);
    fixture.detectChanges();

    expect(component.baseStartTimeMs).toBe(0);
    expect(component.totalDurationMs).toBe(1);
    expect(component.flatTree).toEqual([]);
  });
});
