"""Evaluation only: ordinary conditional computations inside residual branches."""
import torch
from torch import nn


class Choice(nn.Module):
    def forward(self, x, flag):
        if flag:
            y = torch.sin(x)
        else:
            y = torch.tanh(x)
        return y


class ContainedChoice(nn.Module):
    def __init__(self):
        super().__init__()
        self.choose = Choice()
        self.normalize = nn.LayerNorm(8)

    def forward(self, x, flag):
        x = torch.cos(x)
        return self.normalize(x + self.choose(x, flag))


class UnknownChoice(nn.Module):
    def forward(self, x, flag):
        if flag:
            y = foreign_operation(x)
        else:
            y = torch.tanh(x)
        return y


class StatefulChoice(nn.Module):
    def forward(self, x, flag):
        if flag:
            self.saved = torch.sin(x)
            y = self.saved
        else:
            y = torch.tanh(x)
        return y


class ConditionalMosaic(nn.Module):
    def __init__(self):
        super().__init__()
        self.choose = Choice()
        self.unknown = UnknownChoice()
        self.stateful = StatefulChoice()
        self.normalize = nn.LayerNorm(8)

    def forward(self, x, flag):
        x = torch.cos(x)
        known = self.normalize(x + self.choose(x, flag))
        unknown = self.normalize(known + self.unknown(known, flag))
        return self.normalize(unknown + self.stateful(unknown, flag))
