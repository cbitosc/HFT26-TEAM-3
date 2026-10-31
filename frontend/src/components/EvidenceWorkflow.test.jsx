import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ThemeProvider } from '../ui-kit';
import { api } from '../api';
import ReconstructionReadiness from './ReconstructionReadiness';
import WitnessReview from './WitnessReview';
import VehicleMatching from './VehicleMatching';
import EvidenceUploader from './EvidenceUploader';
vi.mock('../api', () => ({ api: { readiness:vi.fn(),buildScenario:vi.fn(),retryJob:vi.fn(),extractLocal:vi.fn(),addClaim:vi.fn(),anchorClaim:vi.fn(),actors:vi.fn(),caseClaims:vi.fn(),sensors:vi.fn(),createActor:vi.fn(),linkActor:vi.fn(),decideLink:vi.fn(),tracks:vi.fn(),upload:vi.fn(),patchSource:vi.fn(),setClock:vi.fn() } }));
const renderUI = x => render(<ThemeProvider><MemoryRouter>{x}</MemoryRouter></ThemeProvider>);
const ready = {can_build:true,scenario_id:'s1',needs_update:true,failed_jobs:[],checks:[{label:'Vehicle matching',ready:false,detail:'1 claim needs matching',section:'matching'}]};
beforeEach(()=>{vi.clearAllMocks();api.readiness.mockResolvedValue(ready);});
it('keeps setup folded and builds a new baseline snapshot on explicit update',async()=>{
  api.buildScenario.mockResolvedValue({id:'s2'});const done=vi.fn();
  renderUI(<ReconstructionReadiness caseId="c1" onBuilt={done} />);
  expect(await screen.findByText('Evidence changed — update reconstruction')).toBeInTheDocument();
  expect(screen.getByText('Review setup').closest('details')).not.toHaveAttribute('open');
  fireEvent.click(screen.getByRole('button',{name:'Update reconstruction'}));
  await waitFor(()=>expect(api.buildScenario).toHaveBeenCalledWith('c1',{name:'Updated reconstruction',baseline:true}));
  await waitFor(()=>expect(done).toHaveBeenCalledWith({id:'s2'}));
});
it('blocks a build when no usable events or claims are available',async()=>{
  api.readiness.mockResolvedValue({...ready,can_build:false,scenario_id:null});
  renderUI(<ReconstructionReadiness caseId="c1" />);
  expect(await screen.findByRole('button',{name:'Build reconstruction'})).toBeDisabled();
});
it('shows extraction failure rather than silently hiding it',async()=>{
  api.extractLocal.mockRejectedValue(new Error('Server unavailable'));
  renderUI(<WitnessReview st={{id:'st1',text_original:'The car stopped.'}} label="Witness A" claims={[]} onChanged={vi.fn()} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:'Extract locally'}));
  expect(await screen.findByText('Server unavailable')).toBeInTheDocument();
});
it('manual quote selection preserves Unicode character offsets',async()=>{
  api.addClaim.mockResolvedValue({});const changed=vi.fn();
  renderUI(<WitnessReview st={{id:'st1',text_original:'🚗 The car stopped.'}} label="Witness A" claims={[]} onChanged={changed} onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button',{name:'Select a quote manually'}));
  const area=screen.getByRole('textbox',{name:/Select the exact words/});area.focus();area.setSelectionRange(3,19);fireEvent.select(area);
  fireEvent.click(screen.getByRole('button',{name:'Save selected claim'}));
  await waitFor(()=>expect(api.addClaim).toHaveBeenCalledWith('st1',expect.objectContaining({char_start:2,char_end:18})));
  await waitFor(()=>expect(changed).toHaveBeenCalled());
});
it('requires an explicit vehicle and review basis to confirm a witness identity',async()=>{
  api.actors.mockResolvedValue({items:[{id:'a1',label:'Vehicle A',links:[]}]});api.caseClaims.mockResolvedValue({items:[{id:'cl1',witness:{label:'Witness A'},explicit_statement:{text:'The blue car stopped.'}}]});api.sensors.mockResolvedValue({items:[]});api.linkActor.mockResolvedValue({});
  renderUI(<VehicleMatching caseId="c1" evidence={[]} onChanged={vi.fn()} />);
  fireEvent.click(screen.getByText('Match vehicles across evidence'));
  const vehicle=await screen.findByRole('combobox',{name:'Which vehicle?'});fireEvent.change(vehicle,{target:{value:'a1'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Evidence type'}),{target:{value:'claim'}});
  fireEvent.change(screen.getByRole('combobox',{name:'Evidence reference'}),{target:{value:'cl1'}});
  expect(screen.getByRole('button',{name:'Confirm match'})).toBeDisabled();
  fireEvent.change(screen.getByRole('textbox',{name:'Why is this the same vehicle?'}),{target:{value:'Blue car identified in statement'}});
  fireEvent.click(screen.getByRole('button',{name:'Confirm match'}));
  await waitFor(()=>expect(api.linkActor).toHaveBeenCalledWith('a1',expect.objectContaining({ref_type:'claim',ref_id:'cl1',status:'confirmed'})));
});

it('mixed demos require an explicit origin and preserve a simulated sensor flag',async()=>{
  api.upload.mockResolvedValue({evidence:{id:'sensor1'}});const done=vi.fn();
  const {container}=renderUI(<EvidenceUploader caseId="c1" designation="mixed" onDone={done} />);
  fireEvent.change(container.querySelector('input[accept=".csv"]'),{target:{files:[new File(['t,speed\n0,12'],'sensor.csv',{type:'text/csv'})]}});
  fireEvent.submit(screen.getByRole('form',{name:'Upload evidence'}));
  expect(await screen.findByText('Declare the origin of every selected source.')).toBeInTheDocument();
  expect(api.upload).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox',{name:'Sensor data origin'}),{target:{value:'synthetic'}});
  fireEvent.submit(screen.getByRole('form',{name:'Upload evidence'}));
  await waitFor(()=>expect(api.upload).toHaveBeenCalledWith('c1',expect.any(File),'sensor_csv',true));
  await waitFor(()=>expect(done).toHaveBeenCalled());
});
