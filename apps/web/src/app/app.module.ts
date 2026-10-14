import { NgModule } from "@angular/core";
import { BrowserModule } from "@angular/platform-browser";
import { AppComponent } from "./app.component";
import { ChatComponent } from "./components/chat/chat.component";
import { ConversationHistoryComponent } from "./components/conversation-history/conversation-history.component";
import { NotificationCenterComponent } from "./components/notification-center/notification-center.component";

@NgModule({
  declarations: [
    AppComponent,
    ChatComponent,
    ConversationHistoryComponent,
    NotificationCenterComponent,
  ],
  imports: [BrowserModule],
  bootstrap: [AppComponent],
})
export class AppModule {}
