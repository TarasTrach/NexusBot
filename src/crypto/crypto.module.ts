import { Module } from "@nestjs/common";
import { P2PModule } from "../p2p/p2p.module";
import { SettingsModule } from "../settings/settings.module";
import { ExchangeFlowsService } from "./exchange-flows.service";
import { FeesService } from "./fees.service";

@Module({
  imports: [P2PModule, SettingsModule],
  providers: [FeesService, ExchangeFlowsService],
  exports: [FeesService, ExchangeFlowsService],
})
export class CryptoModule {}
