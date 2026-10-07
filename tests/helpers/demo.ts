import { defaultSnapshot } from '../../src/lib/demoData';

export function stableDemoSnapshot(){
  const snapshot=structuredClone(defaultSnapshot);
  snapshot.settings.setup_completed=true;
  snapshot.settings.store_status_mode='open';
  snapshot.settings.delivery_enabled=false;
  snapshot.settings.require_area=false;
  snapshot.settings.min_order=0;
  snapshot.settings.announcement_enabled=false;
  snapshot.settings.maintenance_mode=false;
  snapshot.settings.public_site_url='';
  snapshot.settings.whatsapp_number='201012345678';
  return snapshot;
}
