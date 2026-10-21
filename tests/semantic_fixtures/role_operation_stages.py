"""Static-only role-stage evaluation; unfamiliar containers and damaged neighbors."""
from torch import nn
import torch


class QuartzPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.damp = nn.Dropout(0.2)
        self.passage = nn.Identity()
        self.leave = nn.Linear(12, 8)

    def forward(self, x):
        return self.leave(self.passage(self.damp(self.curve(self.enter(x)))))


class RenamedPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.alpha = nn.Linear(8, 12)
        self.beta = nn.GELU()
        self.gamma = nn.Dropout(0.2)
        self.delta = nn.Identity()
        self.epsilon = nn.Linear(12, 8)

    def forward(self, signal):
        return self.epsilon(self.delta(self.gamma(self.beta(self.alpha(signal)))))


class EscapingPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.damp = nn.Dropout(0.2)
        self.leave = nn.Linear(12, 8)

    def forward(self, x):
        y = self.curve(self.enter(x))
        return self.leave(self.damp(y) + y)


class InterruptedPath(nn.Module):
    def __init__(self):
        super().__init__()
        self.enter = nn.Linear(8, 12)
        self.curve = nn.GELU()
        self.leave = nn.Linear(12, 8)

    def forward(self, x):
        return self.leave(unfamiliar_adjustment(self.curve(self.enter(x))))


class ConditionalStageWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = QuartzPath()
        self.second = QuartzPath()

    def forward(self, x, other, flag):
        if flag:
            y = self.first(x)
        else:
            y = other
        return y + self.second(other)


class MixedStageWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.first = QuartzPath()
        self.second = InterruptedPath()
        self.recur = nn.GRU(8, 8, batch_first=True)

    def forward(self, x, other, hidden):
        y = self.first(x)
        z = self.second(other)
        seq, state = self.recur(y + z, hidden)
        return seq, state
