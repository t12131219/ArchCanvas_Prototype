"""New source compositions for coarse, reversible local stage expression."""
from torch import nn
import torch


class StageUnit(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(4, 4)
        self.norm = nn.LayerNorm(4)

    def branch(self, x):
        return torch.tanh(self.project(x)).contiguous()

    def forward(self, x):
        return self.norm(x + self.branch(x))


class StageWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.left = StageUnit()
        self.right = StageUnit()

    def forward(self, x, context):
        left = self.left(x)
        return self.right(left) * context + left


class EscapingWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.project = nn.Linear(4, 4)
        self.norm = nn.LayerNorm(4)
        self.known = StageUnit()

    def forward(self, x, y):
        total = x + self.project(x)
        return self.norm(total), total, self.known(y)


class UnknownWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.known = StageUnit()

    def forward(self, x, context):
        known = self.known(x)
        return foreign_operation(known, context) + known


class StateWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.known = StageUnit()
        self.cell = nn.GRUCell(4, 4)

    def step(self, x, h):
        return self.cell(torch.tanh(x), h).contiguous()

    def forward(self, x, h):
        return self.step(self.known(x), h)


class ConditionalWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.known = StageUnit()
        self.project = nn.Linear(4, 4)
        self.norm = nn.LayerNorm(4)

    def forward(self, x, flag):
        known = self.known(x)
        if flag:
            return self.norm(known + self.project(known))
        return foreign_operation(known)


class RepeatedWeave(nn.Module):
    def __init__(self):
        super().__init__()
        self.blocks = nn.ModuleList([StageUnit() for _ in range(3)])

    def forward(self, x, context):
        for block in self.blocks:
            x = block(x)
        return x * context
