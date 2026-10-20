"""Development inputs: serial source calls with an external shared context."""
import torch
from torch import nn


class LocalPiece(nn.Module):
    def __init__(self):
        super().__init__()
        self.a = nn.Linear(8, 8)

    def forward(self, x):
        return x + torch.relu(self.a(x))


class ContextPiece(nn.Module):
    def __init__(self):
        super().__init__()
        self.gate = nn.Linear(8, 8)
        self.signal = nn.Linear(8, 8)

    def forward(self, x, context):
        return x + torch.sigmoid(self.gate(context)) * self.signal(x)


class CoupledRuns(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = nn.ModuleList([LocalPiece(), LocalPiece(), LocalPiece()])
        self.second = nn.ModuleList([ContextPiece(), ContextPiece(), ContextPiece()])

    def forward(self, x, side):
        for part in self.first:
            x = part(x)
        y = torch.tanh(side)
        for part in self.second:
            y = part(y, x)
        return y + x
