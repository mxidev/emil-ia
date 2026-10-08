import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import { ChatComponent } from "./components/chat/chat.component";
import { ConversationHistoryComponent } from "./components/conversation-history/conversation-history.component";

@NgModule({
  declarations: [AppComponent, ChatComponent, ConversationHistoryComponent],
  imports: [BrowserModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
