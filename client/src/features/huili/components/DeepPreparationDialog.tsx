import { FileText, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { MeetingRecord } from '@shared/api.interface';

const DIRECTION_PRESETS = [
  '只聚焦这次要拍板的事',
  '补齐关键人的立场与反对点',
  '帮我准备提问、回应和取舍',
] as const;

interface DeepPreparationDialogProps {
  meeting?: MeetingRecord;
  instruction: string;
  working: boolean;
  onInstructionChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onSubmit: () => void;
}

export const DeepPreparationDialog = ({
  meeting,
  instruction,
  working,
  onInstructionChange,
  onOpenChange,
  onSubmit,
}: DeepPreparationDialogProps) => {
  const addPreset = (preset: string) => {
    if (instruction.includes(preset)) return;
    onInstructionChange(
      [instruction.trim(), preset].filter(Boolean).join('\n'),
    );
  };

  return (
    <Dialog open={Boolean(meeting)} onOpenChange={onOpenChange}>
      <DialogContent className="deep-preparation-dialog">
        <DialogHeader>
          <p className="kicker">深度会前准备</p>
          <DialogTitle>先校准方向，再生成完整准备</DialogTitle>
          <DialogDescription>
            开始后会先创建飞书文档，再继续补充会议背景、决策选项、建议提问和来源依据。
          </DialogDescription>
        </DialogHeader>
        <div className="deep-preparation-meeting">
          <span>本次准备</span>
          <strong>{meeting?.title}</strong>
        </div>
        <div className="deep-preparation-output" aria-label="将生成的内容">
          <FileText aria-hidden="true" />
          <div>
            <strong>完整飞书文档</strong>
            <span>文档会先建好并可直接打开，完整内容将在后台持续写入。</span>
          </div>
        </div>
        <label className="alignment-field">
          <span>再交代一两句，校准这次准备的方向（可选）</span>
          <Textarea
            autoFocus
            maxLength={1200}
            value={instruction}
            onChange={(event) => onInstructionChange(event.target.value)}
            placeholder="例如：不要再铺全景，重点帮我判断三种方案的取舍，以及财务和业务负责人可能会反对什么。"
          />
        </label>
        <div className="deep-preparation-presets" aria-label="快速补充方向">
          {DIRECTION_PRESETS.map((preset) => (
            <Button
              key={preset}
              type="button"
              variant="outline"
              size="sm"
              aria-pressed={instruction.includes(preset)}
              onClick={() => addPreset(preset)}
            >
              {preset}
            </Button>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="deep-preparation-submit"
            disabled={working}
            onClick={onSubmit}
            data-ai-section-type="button"
          >
            <Sparkles aria-hidden="true" />
            {working ? '正在创建文档' : '创建文档并开始准备'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
