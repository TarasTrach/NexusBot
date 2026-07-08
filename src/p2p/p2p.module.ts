import { Module } from "@nestjs/common";
import { P2PService } from "./p2p.service";

@Module({
  providers: [P2PService],
  exports: [P2PService],
})
export class P2PModule {}
